"""Agent runner: start and observe agent runs over HTTP.

    python3 agent/runner.py            # listens on 127.0.0.1:8791

A host process (Mac today, the hub Pi later). It starts each run with `docker compose exec`
in the researcher container, captures the output, and serves it to the MCP voice bridge
(delegate_to_agent) and the SpatialOS activity panel. Loopback only, no dependencies.

    POST /runs            {"goal": "..."}          -> {"id": ..., "status": "running"}
    GET  /runs                                     -> {"runs": [...newest first...]}
    GET  /runs/{id}?since=N                        -> run + output from byte offset N
    GET  /routines                                 -> routines.toml with next/last run times
    POST /routines/{name}/run                      -> start one now
    GET  /healthz

Routines (agent runs on a schedule) are defined in routines.toml; see routines.py.
"""

from __future__ import annotations

import argparse
import json
import secrets
import subprocess
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from routines import Routine, RoutineState, due, load_routines

HERE = Path(__file__).resolve().parent
COMPOSE_FILE = HERE.parent / "watchdog" / "docker-compose.yml"
RUNS_DIR = HERE / "runs"  # host-side output; the agent's own transcripts stay in workspace/runs
ROUTINES_FILE = HERE / "routines.toml"
ROUTINES_STATE = RUNS_DIR / "routines-state.json"
SCHEDULER_TICK_S = 30
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
    routine: str | None = None  # set when a routine started this run

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

    def start(self, goal: str, routine: str | None = None) -> Run:
        run = Run(id=f"{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}", goal=goal, routine=routine)
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

    def running_routine(self, name: str) -> bool:
        with self._lock:
            return any(r.routine == name and r.status == "running" for r in self._runs.values())

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


class Scheduler:
    """Fires routines when they're due. Re-reads routines.toml every tick, so edits apply live."""

    def __init__(self, runner: Runner, path: Path = ROUTINES_FILE, state_path: Path = ROUTINES_STATE):
        self.runner = runner
        self.path = path
        self.state = RoutineState(state_path)
        self.routines: list[Routine] = []
        self.error: str | None = None
        self.reload()

    def reload(self) -> None:
        try:
            self.routines = load_routines(self.path)
            self.error = None
        except (ValueError, OSError) as e:  # keep the last good set; report the problem
            self.error = str(e)

    def fire(self, routine: Routine, now: datetime) -> Run | None:
        if self.runner.running_routine(routine.name):
            return None  # the previous run of this routine hasn't finished; don't stack them
        self.state.mark(routine.name, now)
        print(f"[runner] routine {routine.name} due; starting", flush=True)
        return self.runner.start(f"[{routine.name}] {routine.goal}", routine=routine.name)

    def tick(self, now: datetime | None = None) -> None:
        now = now or datetime.now()
        self.reload()
        for routine in due(self.routines, self.state, now):
            self.fire(routine, now)

    def loop(self) -> None:
        while True:
            try:
                self.tick()
            except Exception as e:  # a scheduler crash must not take the runner down
                print(f"[runner] scheduler error: {e}", flush=True)
            time.sleep(SCHEDULER_TICK_S)

    def describe(self) -> dict:
        now = datetime.now()
        return {
            "file": str(self.path),
            "error": self.error,
            "routines": [
                {
                    "name": r.name,
                    "schedule": r.schedule.describe(),
                    "goal": r.goal,
                    "enabled": r.enabled,
                    "last_run": (last := self.state.last(r.name)) and last.isoformat(timespec="minutes"),
                    "next_run": r.schedule.next_after(self.state.anchor(r.name, now), now).isoformat(timespec="minutes") if r.enabled else None,
                    "running": self.runner.running_routine(r.name),
                }
                for r in self.routines
            ],
        }


def make_handler(runner: Runner, scheduler: Scheduler):
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
            if url.path == "/routines":
                return self._json(200, scheduler.describe())
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
            path = urlsplit(self.path).path
            if path.startswith("/routines/") and path.endswith("/run"):
                name = path[len("/routines/"):-len("/run")]
                routine = next((r for r in scheduler.routines if r.name == name), None)
                if routine is None:
                    return self._json(404, {"error": f"no routine named {name!r}"})
                run = scheduler.fire(routine, datetime.now())
                if run is None:
                    return self._json(409, {"error": f"routine {name!r} is already running"})
                return self._json(202, {"id": run.id, "status": run.status})
            if path != "/runs":
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
    scheduler = Scheduler(runner)
    threading.Thread(target=scheduler.loop, daemon=True, name="scheduler").start()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(runner, scheduler))
    names = ", ".join(r.name for r in scheduler.routines) or "none"
    print(f"[runner] listening on http://{args.host}:{args.port}, runs in {RUNS_DIR}; routines: {names}", flush=True)
    if scheduler.error:
        print(f"[runner] routines.toml problem: {scheduler.error}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
