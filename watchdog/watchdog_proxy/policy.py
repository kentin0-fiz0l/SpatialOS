"""Policy engine: decides whether an agent's outbound request is allowed, denied, or needs a human.

Rules are evaluated top to bottom; the first match wins. Requests no rule matches
fall through to `decide_unmatched`.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass
from enum import Enum
from typing import Any


class Decision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    ASK = "ask"


@dataclass(frozen=True)
class RequestContext:
    """What the watchdog knows about one outbound request."""

    agent: str
    method: str  # upper-case, e.g. "POST"
    host: str  # lower-case real destination (never the Host header)
    path: str  # without query string
    body_size: int = 0
    query_size: int = 0


@dataclass(frozen=True)
class Verdict:
    decision: Decision
    reason: str
    rule: int | None = None  # index into the rule list; None when no rule matched


@dataclass(frozen=True)
class Rule:
    decision: Decision
    hosts: tuple[str, ...] = ("*",)
    methods: tuple[str, ...] = ("*",)
    paths: tuple[str, ...] = ("*",)
    agents: tuple[str, ...] = ("*",)
    reason: str = ""

    def matches(self, ctx: RequestContext) -> bool:
        return (
            _matches_any(ctx.host, self.hosts)
            and _matches_any(ctx.method, self.methods)
            and _matches_any(ctx.path, self.paths)
            and _matches_any(ctx.agent, self.agents)
        )


def _matches_any(value: str, patterns: tuple[str, ...]) -> bool:
    return any(fnmatch.fnmatchcase(value, p) for p in patterns)


class Policy:
    def __init__(self, rules: list[Rule]):
        self.rules = rules

    def evaluate(self, ctx: RequestContext) -> Verdict:
        for i, rule in enumerate(self.rules):
            if rule.matches(ctx):
                return Verdict(rule.decision, rule.reason or f"rule {i}", i)
        return Verdict(decide_unmatched(ctx), "no rule matched")


SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MAX_UNREVIEWED_QUERY = 256  # bytes; long query strings are an exfiltration channel


def decide_unmatched(ctx: RequestContext) -> Decision:
    """Fallback for requests that no rule covers.

    Small reads pass so browsing works; anything that could carry data out asks a human.
    (Unregistered clients never get here; the addon denies them before rules run.)
    """
    is_small_read = ctx.method in SAFE_METHODS and ctx.body_size == 0 and ctx.query_size <= MAX_UNREVIEWED_QUERY
    return Decision.ALLOW if is_small_read else Decision.ASK


def load_rules(raw: list[dict[str, Any]]) -> list[Rule]:
    """Build rules from YAML. Each field accepts a single string or a list."""
    rules = []
    for i, entry in enumerate(raw):
        try:
            decision = Decision(entry["decision"])
        except (KeyError, ValueError) as e:
            raise ValueError(f"rule {i}: 'decision' must be one of allow/deny/ask") from e
        rules.append(
            Rule(
                decision=decision,
                hosts=_patterns(entry, "hosts", str.lower),
                methods=_patterns(entry, "methods", str.upper),
                paths=_patterns(entry, "paths"),
                agents=_patterns(entry, "agents"),
                reason=entry.get("reason", ""),
            )
        )
    return rules


def _patterns(entry: dict[str, Any], key: str, normalize=lambda s: s) -> tuple[str, ...]:
    value = entry.get(key, "*")
    values = [value] if isinstance(value, str) else list(value)
    return tuple(normalize(v) for v in values)
