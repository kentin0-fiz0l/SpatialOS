"""Researcher agent: a Claude tool-use loop that runs behind the watchdog.

    python agent.py "research X and write a summary"

Every request it makes, the Claude API included, goes through the watchdog proxy. It holds no
real API key (the watchdog injects it), and it can only read and write files in /workspace.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

import anthropic
import httpx2
import yaml
from anthropic import beta_tool

WORKSPACE = Path(os.environ.get("AGENT_WORKSPACE", "/workspace")).resolve()
SKILLS_DIR = Path(os.environ.get("AGENT_SKILLS", "/app/skills")).resolve()
DEVICES_FILE = Path(os.environ.get("AGENT_DEVICES", "/config/devices.yaml"))
MODEL = os.environ.get("AGENT_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("AGENT_EFFORT", "high")
MAX_ITERATIONS = int(os.environ.get("AGENT_MAX_ITERATIONS", "30"))
FETCH_CHARS = 20_000
# Requests can be held for human approval (watchdog approvals.timeout_seconds, default 300s),
# so the HTTP timeout has to outlast that or approving does nothing.
HTTP_TIMEOUT = float(os.environ.get("AGENT_HTTP_TIMEOUT", "330"))
# Sites like Wikipedia reject generic library user agents and ask bots to say who runs them.
_contact = os.environ.get("AGENT_CONTACT", "")
USER_AGENT = f"SpatialOS-Researcher/0.1 (personal research agent{'; ' + _contact if _contact else ''})"

# Opus 5.5 list prices per million tokens, for a rough running total. Cache writes (5-minute
# TTL) cost 1.25x input, cache reads $0.20. Fallback turns bill at their own model's rate.
PRICE_PER_MTOK = {"input": 4.00, "cache_write": 5.00, "cache_read": 0.20, "output": 20.00}

SYSTEM = """You are a personal agent working in an isolated container. You research things on
the web and control devices on the owner's home network.

All of your network traffic passes through a security proxy (the watchdog). It may allow a
request, deny it, or hold it until the human approves on their phone, which can take a few
minutes. If a request comes back blocked, don't retry it or look for a way around the block:
carry on with what you can, and say in your result what was blocked.

Web: use fetch_url to read pages.

Devices: list_devices shows every device you can reach, with its address and the skill to
use. Before touching a device, read_skill("home_link") for the shared rules, then read_skill
for that device's skill and follow it. Talk to devices with http_request. Never guess at
addresses: only inventoried devices exist.

Save your work in the workspace with write_file. For research tasks, write the final result
to a markdown file, cite the URLs you used, and finish with one line naming the file. For
device tasks, finish by reporting what actually changed, read back from the device."""


# ── tools ────────────────────────────────────────────────────────────────────


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head"}

    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self._skipping = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skipping += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skipping:
            self._skipping -= 1

    def handle_data(self, data):
        if not self._skipping:
            self.parts.append(data)


def _html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return re.sub(r"\n\s*\n+", "\n\n", re.sub(r"[ \t]+", " ", "".join(parser.parts))).strip()


class _Blocked(Exception):
    """The watchdog refused the request; the message is its reason."""


def _send(method: str, url: str, headers: dict[str, str] | None = None, body: str | None = None,
          follow_redirects: bool = False) -> httpx2.Response:
    """One path for every outbound request, so watchdog signals are read the same way everywhere."""
    try:
        with httpx2.Client(timeout=HTTP_TIMEOUT, follow_redirects=follow_redirects,
                           headers={"User-Agent": USER_AGENT}) as http:
            resp = http.request(method, url, headers=headers or {}, content=body)
    except httpx2.ProxyError as e:
        # A refused CONNECT: the watchdog blocked the tunnel itself (its reason is in the status line).
        if "watchdog" in str(e).lower():
            raise _Blocked("refused at connection time") from e
        raise
    if resp.headers.get("X-Watchdog-Decision") == "deny":
        try:
            reason = resp.json().get("reason", "no reason given")
        except ValueError:
            reason = resp.text[:200]
        raise _Blocked(reason)
    return resp


def _describe(resp: httpx2.Response, method: str, url: str, text: str) -> str:
    if len(text) > FETCH_CHARS:
        text = text[:FETCH_CHARS] + f"\n\n[truncated at {FETCH_CHARS} characters]"
    held = " (held by the watchdog and approved by the owner)" if resp.headers.get("X-Watchdog-Decision") == "approved" else ""
    ctype = resp.headers.get("content-type", "")
    return f"HTTP {resp.status_code} {method} {resp.url}{held}\nContent-Type: {ctype}\n\n{text}"


@beta_tool
def fetch_url(url: str) -> str:
    """Fetch a web page and return its text (HTML is converted to plain text).

    Args:
        url: Absolute http(s) URL to fetch.
    """
    try:
        resp = _send("GET", url, follow_redirects=True)
    except _Blocked as e:
        return f"Blocked by watchdog: {e}"
    except httpx2.HTTPError as e:
        return f"Error fetching {url}: {e}"
    body = resp.text
    if "html" in resp.headers.get("content-type", ""):
        body = _html_to_text(body)
    return _describe(resp, "GET", url, body)


@beta_tool
def http_request(method: str, url: str, headers: dict[str, str] | None = None, body: str | None = None) -> str:
    """Send an HTTP request and return the status, headers of note, and body (up to 20k chars).

    Use this for device control and any non-GET request. Credentials: send the literal value
    "injected-by-watchdog" in the header the device inventory names; the watchdog fills it in.
    Writes may be held for human approval; the call blocks until it is decided.

    Args:
        method: GET, POST, PUT, PATCH or DELETE.
        url: Absolute http(s) URL.
        headers: Extra request headers, e.g. {"Content-Type": "application/json"}.
        body: Request body as a string (JSON should already be serialized).
    """
    method = method.upper()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        return f"Error: unsupported method {method}"
    try:
        resp = _send(method, url, headers, body)
    except _Blocked as e:
        return f"Blocked by watchdog: {e}"
    except httpx2.HTTPError as e:
        return f"Error sending {method} {url}: {e}"
    return _describe(resp, method, url, resp.text)


@beta_tool
def list_devices() -> str:
    """List the home-network devices you are allowed to reach: name, address, skill, notes."""
    try:
        devices = (yaml.safe_load(DEVICES_FILE.read_text()) or {}).get("devices", [])
    except OSError:
        return "No device inventory is configured."
    if not devices:
        return "The device inventory is empty: no devices can be reached."
    lines = []
    for d in devices:
        cred = d.get("credential", {}).get("header")
        lines.append(
            f"- {d.get('name')}: http://{d.get('host')}  skill={d.get('skill') or 'none'}"
            + (f"  credential header={cred}" if cred else "")
            + (f"\n    {d['notes']}" if d.get("notes") else "")
        )
    return "\n".join(lines)


@beta_tool
def list_skills() -> str:
    """List the device skills available to read_skill, with one line each."""
    catalog = SKILLS_DIR / "CATALOG.md"
    if catalog.exists():
        return catalog.read_text()
    names = sorted(p.parent.name for p in SKILLS_DIR.glob("*/SKILL.md"))
    return "\n".join(names) or "No skills installed."


@beta_tool
def read_skill(name: str) -> str:
    """Read a skill's instructions. Use "home_link" for the shared rules, else a name from list_skills.

    Args:
        name: Skill directory name, e.g. "gadget-philips-hue-bridges", or "home_link".
    """
    if name == "home_link":
        path = SKILLS_DIR / "home_link.md"
    else:
        path = SKILLS_DIR / name / "SKILL.md"
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name) or not path.is_file():
        return f"Error: no skill named {name!r}. Use list_skills."
    return path.read_text()


def _in_workspace(path: str) -> Path:
    target = (WORKSPACE / path).resolve()
    if target != WORKSPACE and WORKSPACE not in target.parents:
        raise ValueError(f"{path!r} is outside the workspace")
    return target


@beta_tool
def write_file(path: str, content: str) -> str:
    """Write a text file in the workspace, creating folders as needed. Overwrites existing files.

    Args:
        path: Path relative to the workspace, e.g. "notes/sources.md".
        content: Full file contents.
    """
    try:
        target = _in_workspace(path)
    except ValueError as e:
        return f"Error: {e}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    return f"Wrote {len(content)} characters to {path}"


@beta_tool
def read_file(path: str) -> str:
    """Read a text file from the workspace.

    Args:
        path: Path relative to the workspace.
    """
    try:
        return _in_workspace(path).read_text()
    except (ValueError, OSError) as e:
        return f"Error: {e}"


@beta_tool
def list_files() -> str:
    """List every file in the workspace."""
    files = sorted(str(p.relative_to(WORKSPACE)) for p in WORKSPACE.rglob("*") if p.is_file())
    return "\n".join(files) or "(workspace is empty)"


# ── loop ─────────────────────────────────────────────────────────────────────


def _show(message) -> None:
    for block in message.content:
        if block.type == "thinking" and block.thinking:
            print(f"  · thinking: {block.thinking[:200].strip()}")
        elif block.type == "text" and block.text.strip():
            print(f"  {block.text.strip()}")
        elif block.type == "tool_use":
            args = json.dumps(block.input)
            print(f"  → {block.name}({args[:150]}{'…' if len(args) > 150 else ''})")
        elif block.type == "fallback":
            print(f"  ! {block.from_.model} declined; continued on {block.to.model}")


def run(goal: str) -> int:
    client = anthropic.Anthropic(timeout=HTTP_TIMEOUT)
    runs = WORKSPACE / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    transcript = runs / f"{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    tokens = dict.fromkeys(PRICE_PER_MTOK, 0)

    runner = client.beta.messages.tool_runner(
        model=MODEL,
        max_tokens=16000,
        # Caching: a fixed breakpoint after the system prompt (tools render before it, so they're
        # covered too), plus top-level automatic caching that follows the growing conversation.
        # Everything earlier in the prompt must stay byte-identical between steps for this to hit.
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        cache_control={"type": "ephemeral"},
        thinking={"type": "adaptive", "display": "summarized"},
        output_config={"effort": EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        max_iterations=MAX_ITERATIONS,
        tools=[fetch_url, http_request, list_devices, list_skills, read_skill, write_file, read_file, list_files],
        messages=[{"role": "user", "content": goal}],
    )

    print(f"goal: {goal}\nmodel: {MODEL} (effort {EFFORT}), transcript: {transcript.relative_to(WORKSPACE)}\n")
    last = None
    try:
        for i, message in enumerate(runner, 1):
            last = message
            u = message.usage
            print(f"[{i}] cache read {u.cache_read_input_tokens or 0:,} · written {u.cache_creation_input_tokens or 0:,} · uncached {u.input_tokens:,}")
            _show(message)
            tokens["input"] += u.input_tokens
            tokens["cache_write"] += u.cache_creation_input_tokens or 0
            tokens["cache_read"] += u.cache_read_input_tokens or 0
            tokens["output"] += u.output_tokens
            with transcript.open("a") as f:
                f.write(message.model_dump_json() + "\n")
    except anthropic.AuthenticationError:
        print("\nClaude API rejected the key. Check ANTHROPIC_API_KEY in watchdog/.env.", file=sys.stderr)
        return 1
    except anthropic.PermissionDeniedError as e:  # also what a watchdog deny looks like to the SDK
        print(f"\nClaude API request refused: {e.message}", file=sys.stderr)
        return 1
    except anthropic.RateLimitError:
        print("\nRate limited by the Claude API. Try again in a minute.", file=sys.stderr)
        return 1
    except anthropic.APIStatusError as e:
        print(f"\nClaude API error {e.status_code}: {e.message}", file=sys.stderr)
        return 1
    except anthropic.APIConnectionError as e:
        print(f"\nCouldn't reach the Claude API through the watchdog: {e}", file=sys.stderr)
        return 1

    cost = sum(tokens[k] * PRICE_PER_MTOK[k] for k in tokens) / 1_000_000
    stop = last.stop_reason if last else "no response"
    prompt = tokens["input"] + tokens["cache_write"] + tokens["cache_read"]
    hit = tokens["cache_read"] / prompt if prompt else 0
    print(
        f"\nstopped: {stop}; prompt {prompt:,} tokens ({hit:.0%} from cache: "
        f"{tokens['cache_read']:,} read, {tokens['cache_write']:,} written, {tokens['input']:,} uncached), "
        f"output {tokens['output']:,}; ~${cost:.2f}"
    )
    if stop == "refusal":
        print(f"refused: {last.stop_details.category if last.stop_details else 'no details'}")
    elif stop == "tool_use":
        print(f"hit the {MAX_ITERATIONS}-iteration limit before finishing (AGENT_MAX_ITERATIONS)")
    return 0 if stop == "end_turn" else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("goal", help="what the agent should do")
    sys.exit(run(parser.parse_args().goal))
