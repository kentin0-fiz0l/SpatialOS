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
from anthropic import beta_tool

WORKSPACE = Path(os.environ.get("AGENT_WORKSPACE", "/workspace")).resolve()
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

# Opus 5.5 list prices, for a rough running total. Fallback turns bill at their own model's rate.
PRICE_PER_MTOK = {"input": 4.00, "output": 20.00}

SYSTEM = """You are a research agent working in an isolated container.

All of your network traffic passes through a security proxy (the watchdog). It may allow a
request, deny it, or hold it until the human approves. If a fetch comes back blocked, don't
retry it or look for a way around the block: carry on with what you have, and say in your
result what you couldn't access.

Use fetch_url to read web pages. Save your work in the workspace with write_file. When you are
done, write the final result to a markdown file, cite the URLs you used, and finish with one
line naming the file."""


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


@beta_tool
def fetch_url(url: str) -> str:
    """Fetch a web page and return its text (HTML is converted to plain text).

    Args:
        url: Absolute http(s) URL to fetch.
    """
    try:
        with httpx2.Client(timeout=HTTP_TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as http:
            resp = http.get(url)
    except httpx2.HTTPError as e:
        return f"Error fetching {url}: {e}"
    if resp.headers.get("X-Watchdog-Decision") == "deny":
        reason = resp.json().get("reason", "no reason given")
        return f"Blocked by watchdog: {reason}"
    body = resp.text
    if "html" in resp.headers.get("content-type", ""):
        body = _html_to_text(body)
    note = ""
    if len(body) > FETCH_CHARS:
        body, note = body[:FETCH_CHARS], f"\n\n[truncated: page is longer than {FETCH_CHARS} characters]"
    return f"HTTP {resp.status_code} {resp.url}\n\n{body}{note}"


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
    tokens = {"input": 0, "output": 0}

    runner = client.beta.messages.tool_runner(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        thinking={"type": "adaptive", "display": "summarized"},
        output_config={"effort": EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        max_iterations=MAX_ITERATIONS,
        tools=[fetch_url, write_file, read_file, list_files],
        messages=[{"role": "user", "content": goal}],
    )

    print(f"goal: {goal}\nmodel: {MODEL} (effort {EFFORT}), transcript: {transcript.relative_to(WORKSPACE)}\n")
    last = None
    try:
        for i, message in enumerate(runner, 1):
            last = message
            print(f"[{i}]")
            _show(message)
            tokens["input"] += message.usage.input_tokens
            tokens["output"] += message.usage.output_tokens
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
    print(f"\nstopped: {stop}; tokens in/out {tokens['input']:,}/{tokens['output']:,}; ~${cost:.2f}")
    if stop == "refusal":
        print(f"refused: {last.stop_details.category if last.stop_details else 'no details'}")
    elif stop == "tool_use":
        print(f"hit the {MAX_ITERATIONS}-iteration limit before finishing (AGENT_MAX_ITERATIONS)")
    return 0 if stop == "end_turn" else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("goal", help="what the agent should do")
    sys.exit(run(parser.parse_args().goal))
