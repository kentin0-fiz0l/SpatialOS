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

    def tail(self, limit: int) -> list[dict]:
        """The most recent `limit` records, oldest first. Reads the whole file; fine at this scale."""
        try:
            lines = self.path.read_text().splitlines()
        except OSError:
            return []
        records = []
        for line in lines[-limit:]:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # a partially written last line
        return records

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
