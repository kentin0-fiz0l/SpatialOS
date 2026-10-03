"""Agent runner: start and observe agent runs over HTTP.

    python3 agent/runner.py            # listens on 127.0.0.1:8791

A host process (Mac today, the hub Pi later). It starts each run with `docker compose exec`
in the researcher container, captures the output, and serves it to the MCP voice bridge
(delegate_to_agent) and the SpatialOS activity panel. Loopback only, no dependencies.

    POST /runs            {"goal": "..."}          -> {"id": ..., "status": "running"}
    GET  /runs                                     -> {"runs": [...newest first...]}
    GET  /runs/{id}?since=N                        -> run + output from byte offset N
    GET  /healthz
"""

from __future__ import annotations

import argparse
import json
import secrets
import subprocess
import threading
import time
from dataclasses import asdict, dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
COMPOSE_FILE = HERE.parent / "watchdog" / "docker-compose.yml"
RUNS_DIR = HERE / "runs"  # host-side output; the agent's own transcripts stay in workspace/runs
MAX_GOAL_CHARS = 2000
MAX_RUNS_KEPT = 200
OUTPUT_CHUNK = 64_000


@dataclass
class Run:
    id: str
    goal: str
    status: str = "running"  # running | done | failed | error
    started: float = field(default_factory=time.time)
    ended: float | None = None
    exit_code: int | None = None
    summary: str = ""  # the agent's final "stopped: ..." line, once there is one

    @property
    def log_path(self) -> Path:
        return RUNS_DIR / f"{self.id}.log"


class Runner:
    def __init__(self, compose_file: Path, service: str = "researcher"):
        self.compose_file = compose_file
        self.service = service
        self._runs: dict[str, Run] = {}
        self._lock = threading.Lock()
        RUNS_DIR.mkdir(parents=True, exist_ok=True)

    def start(self, goal: str) -> Run:
        run = Run(id=f"{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}", goal=goal)
        with self._lock:
            self._runs[run.id] = run
            for old in sorted(self._runs.values(), key=lambda r: r.started)[:-MAX_RUNS_KEPT]:
                self._runs.pop(old.id, None)
        threading.Thread(target=self._execute, args=(run,), daemon=True).start()
        return run

    def _execute(self, run: Run) -> None:
        # argv, never a shell: the goal is user text and must not be interpreted.
        cmd = ["docker", "compose", "-f", str(self.compose_file), "exec", "-T", self.service,
               "python", "agent.py", run.goal]
        try:
            with run.log_path.open("wb") as log:
                proc = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
            run.exit_code = proc.returncode
            run.status = "done" if proc.returncode == 0 else "failed"
        except OSError as e:
            run.log_path.write_text(f"runner error: {e}\n")
            run.status, run.exit_code = "error", -1
        finally:
            run.ended = time.time()
            run.summary = self._summary_line(run)

    @staticmethod
    def _summary_line(run: Run) -> str:
        try:
            lines = run.log_path.read_text(errors="replace").splitlines()
        except OSError:
            return ""
        return next((l for l in reversed(lines) if l.startswith("stopped:")), "") or (lines[-1] if lines else "")

    def list(self) -> list[dict]:
        with self._lock:
            runs = sorted(self._runs.values(), key=lambda r: r.started, reverse=True)
        return [asdict(r) for r in runs]

    def get(self, run_id: str) -> Run | None:
        with self._lock:
            return self._runs.get(run_id)

    @staticmethod
    def output(run: Run, since: int) -> tuple[str, int]:
        """Output from byte offset `since`, capped; returns (text, next offset)."""
        try:
            with run.log_path.open("rb") as f:
                f.seek(since)
                chunk = f.read(OUTPUT_CHUNK)
        except OSError:
            return "", since
        return chunk.decode("utf-8", errors="replace"), since + len(chunk)


def make_handler(runner: Runner):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            url = urlsplit(self.path)
            if url.path == "/healthz":
                return self._json(200, {"ok": True})
            if url.path == "/runs":
                return self._json(200, {"runs": runner.list()})
            if url.path.startswith("/runs/"):
                run = runner.get(url.path[len("/runs/"):])
                if run is None:
                    return self._json(404, {"error": "no such run"})
                try:
                    since = max(0, int(parse_qs(url.query).get("since", ["0"])[0]))
                except ValueError:
                    return self._json(400, {"error": "since must be an integer"})
                text, offset = runner.output(run, since)
                return self._json(200, {**asdict(run), "output": text, "next": offset})
            self._json(404, {"error": "not found"})

        def do_POST(self) -> None:
            if urlsplit(self.path).path != "/runs":
                return self._json(404, {"error": "not found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                goal = str(body["goal"]).strip()
            except (ValueError, KeyError, TypeError):
                return self._json(400, {"error": "body must be JSON with a 'goal' string"})
            if not goal or len(goal) > MAX_GOAL_CHARS:
                return self._json(400, {"error": f"goal must be 1-{MAX_GOAL_CHARS} characters"})
            run = runner.start(goal)
            self._json(202, {"id": run.id, "status": run.status})

        def log_message(self, fmt, *args) -> None:  # one line per request, no client details
            print(f"[runner] {args[0]}", flush=True)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8791)
    parser.add_argument("--compose-file", type=Path, default=COMPOSE_FILE)
    args = parser.parse_args()
    runner = Runner(args.compose_file)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(runner))
    print(f"[runner] listening on http://{args.host}:{args.port}, runs in {RUNS_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
