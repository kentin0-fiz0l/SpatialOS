"""Append-only JSONL audit log: one line per decision, for an activity view later."""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path

from .policy import RequestContext, Verdict


class AuditLog:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, ctx: RequestContext, verdict: Verdict) -> None:
        record = {
            "ts": time.time(),
            **asdict(ctx),
            "decision": verdict.decision.value,
            "reason": verdict.reason,
            "rule": verdict.rule,
        }
        with self.path.open("a") as f:
            f.write(json.dumps(record) + "\n")
