"""Routines: agent runs on a schedule.

Defined in routines.toml next to this file:

    [[routine]]
    name = "morning-brief"
    schedule = "daily 07:00"          # or "weekly mon 07:30", or "every 6h" / "every 30m" / "every 2d"
    goal = "Research ... and write today's brief to briefs/<date>.md"
    enabled = true                    # optional, default true

Times are local to the machine running the runner. The runner remembers each routine's last
start and when it first saw the routine in runs/routines-state.json, so a restart doesn't
re-fire a routine that already ran, and a new routine waits for its first slot after it
was added.
"""

from __future__ import annotations

import json
import re
import tomllib
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
UNITS = {"m": 60, "h": 3600, "d": 86400}
MAX_NAME = 40


@dataclass(frozen=True)
class Schedule:
    kind: str  # daily | weekly | every
    hour: int = 0
    minute: int = 0
    weekday: int = 0  # Monday = 0
    seconds: int = 0

    def next_after(self, anchor: datetime, now: datetime) -> datetime:
        """The first scheduled time strictly after `anchor` (the last run, or when the routine
        was added). It may be in the past: that's a slot the runner missed and should catch up,
        never one it repeats."""
        if self.kind == "every":
            return anchor + timedelta(seconds=self.seconds)
        candidate = anchor.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
        if self.kind == "weekly":
            candidate -= timedelta(days=(candidate.weekday() - self.weekday) % 7)
        step = timedelta(days=7 if self.kind == "weekly" else 1)
        while candidate <= anchor:
            candidate += step
        return candidate

    def describe(self) -> str:
        if self.kind == "every":
            s = self.seconds
            return f"every {s // 86400}d" if s % 86400 == 0 else f"every {s // 3600}h" if s % 3600 == 0 else f"every {s // 60}m"
        when = f"{self.hour:02d}:{self.minute:02d}"
        return f"daily {when}" if self.kind == "daily" else f"weekly {DAYS[self.weekday]} {when}"


def parse_schedule(text: str) -> Schedule:
    t = text.strip().lower()
    if m := re.fullmatch(r"daily (\d{1,2}):(\d{2})", t):
        return Schedule("daily", *_hm(m.group(1), m.group(2)))
    if m := re.fullmatch(r"weekly (mon|tue|wed|thu|fri|sat|sun) (\d{1,2}):(\d{2})", t):
        return Schedule("weekly", *_hm(m.group(2), m.group(3)), weekday=DAYS.index(m.group(1)))
    if m := re.fullmatch(r"every (\d+)([mhd])", t):
        seconds = int(m.group(1)) * UNITS[m.group(2)]
        if seconds < 300:
            raise ValueError(f"{text!r}: shortest interval is 5m")
        return Schedule("every", seconds=seconds)
    raise ValueError(f"{text!r}: use 'daily HH:MM', 'weekly <day> HH:MM' or 'every <N>m|h|d'")


def _hm(h: str, m: str) -> tuple[int, int]:
    hour, minute = int(h), int(m)
    if not (0 <= hour < 24 and 0 <= minute < 60):
        raise ValueError(f"bad time {h}:{m}")
    return hour, minute


@dataclass(frozen=True)
class Routine:
    name: str
    schedule: Schedule
    goal: str
    enabled: bool = True


def load_routines(path: Path) -> list[Routine]:
    """Parse routines.toml. A missing file means no routines; a bad entry names itself."""
    if not path.exists():
        return []
    data = tomllib.loads(path.read_text())
    routines, seen = [], set()
    for i, entry in enumerate(data.get("routine", [])):
        name = str(entry.get("name", "")).strip()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,%d}" % (MAX_NAME - 1), name):
            raise ValueError(f"routine {i}: name must be lowercase letters, digits and dashes")
        if name in seen:
            raise ValueError(f"routine {name!r} is defined twice")
        seen.add(name)
        try:
            schedule = parse_schedule(str(entry["schedule"]))
            goal = str(entry["goal"]).strip()
        except KeyError as e:
            raise ValueError(f"routine {name!r}: missing {e.args[0]!r}") from e
        if not goal:
            raise ValueError(f"routine {name!r}: goal is empty")
        routines.append(Routine(name, schedule, goal, bool(entry.get("enabled", True))))
    return routines


class RoutineState:
    """Per routine: when it was first seen and when it last started. Persisted so restarts
    don't re-fire, and a routine added at 15:00 doesn't run "yesterday's" 07:00 slot."""

    def __init__(self, path: Path):
        self.path = path
        self._last: dict[str, datetime] = {}
        self._seen: dict[str, datetime] = {}
        try:
            data = json.loads(path.read_text())
            self._last = {k: datetime.fromisoformat(v) for k, v in data.get("last", {}).items()}
            self._seen = {k: datetime.fromisoformat(v) for k, v in data.get("seen", {}).items()}
        except (OSError, ValueError, AttributeError):
            pass

    def last(self, name: str) -> datetime | None:
        return self._last.get(name)

    def anchor(self, name: str, now: datetime) -> datetime:
        """What the next slot is measured from: the last run, else when the routine appeared."""
        if name not in self._seen:
            self._seen[name] = now
            self._save()
        return self._last.get(name) or self._seen[name]

    def mark(self, name: str, when: datetime) -> None:
        self._last[name] = when
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({
            "last": {k: v.isoformat() for k, v in self._last.items()},
            "seen": {k: v.isoformat() for k, v in self._seen.items()},
        }, indent=1))


def due(routines: list[Routine], state: RoutineState, now: datetime) -> list[Routine]:
    return [r for r in routines if r.enabled and r.schedule.next_after(state.anchor(r.name, now), now) <= now]
