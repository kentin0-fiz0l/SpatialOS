from datetime import datetime, timedelta

import pytest

from routines import RoutineState, due, load_routines, parse_schedule

MON_0630 = datetime(2026, 10, 5, 6, 30)  # a Monday
MON_0700 = datetime(2026, 10, 5, 7, 0)
MON_0800 = datetime(2026, 10, 5, 8, 0)


def test_parse_forms():
    assert parse_schedule("daily 07:00").describe() == "daily 07:00"
    assert parse_schedule("Weekly Fri 18:30").describe() == "weekly fri 18:30"
    assert parse_schedule("every 6h").describe() == "every 6h"
    assert parse_schedule("every 90m").describe() == "every 90m"
    assert parse_schedule("every 2d").describe() == "every 2d"


@pytest.mark.parametrize("bad", ["hourly", "daily 25:00", "weekly fun 09:00", "every 1m", "every 3w", ""])
def test_parse_rejects(bad):
    with pytest.raises(ValueError):
        parse_schedule(bad)


def test_daily_next_slot_after_anchor():
    s = parse_schedule("daily 07:00")
    assert s.next_after(MON_0630, MON_0630) == MON_0700  # added at 06:30: today's 07:00
    assert s.next_after(MON_0800, MON_0800) == MON_0700 + timedelta(days=1)  # added at 08:00: tomorrow
    assert s.next_after(MON_0700 - timedelta(days=1), MON_0800) == MON_0700  # ran yesterday, now 08:00: today's slot (missed, catch up)
    assert s.next_after(MON_0700, MON_0800) == MON_0700 + timedelta(days=1)  # ran today: tomorrow


def test_weekly_lands_on_the_right_day():
    s = parse_schedule("weekly mon 07:00")
    assert s.next_after(MON_0700, MON_0800) == MON_0700 + timedelta(days=7)
    sat = MON_0800 - timedelta(days=2)
    assert s.next_after(sat, sat) == MON_0700  # added Saturday: this coming Monday
    assert s.next_after(MON_0630, MON_0630) == MON_0700  # added Monday 06:30: today


def test_every_interval():
    s = parse_schedule("every 6h")
    assert s.next_after(MON_0700, MON_0800) == MON_0700 + timedelta(hours=6)


def test_due_respects_state_and_enabled(tmp_path):
    (tmp_path / "routines.toml").write_text('''
[[routine]]
name = "brief"
schedule = "daily 07:00"
goal = "write the brief"

[[routine]]
name = "off"
schedule = "every 1h"
goal = "never"
enabled = false
''')
    routines = load_routines(tmp_path / "routines.toml")
    state = RoutineState(tmp_path / "state.json")
    assert due(routines, state, MON_0630) == []  # first seen 06:30: not due until 07:00
    assert [r.name for r in due(routines, state, MON_0700 + timedelta(seconds=20))] == ["brief"]  # a 30s tick still catches it
    state.mark("brief", MON_0700 + timedelta(seconds=20))
    assert due(routines, state, MON_0800) == []
    # persisted: a fresh state object remembers the run
    assert due(routines, RoutineState(tmp_path / "state.json"), MON_0800) == []
    assert [r.name for r in due(routines, state, MON_0800 + timedelta(days=1))] == ["brief"]  # missed tomorrow's 07:00 by an hour: catch up


def test_new_routine_added_after_slot_waits_for_tomorrow(tmp_path):
    (tmp_path / "r.toml").write_text('[[routine]]\nname = "brief"\nschedule = "daily 07:00"\ngoal = "x"\n')
    routines = load_routines(tmp_path / "r.toml")
    state = RoutineState(tmp_path / "s.json")
    assert due(routines, state, MON_0800) == []  # first seen at 08:00
    assert due(routines, state, MON_0800 + timedelta(hours=22)) == []  # 06:00 next day
    assert [r.name for r in due(routines, state, MON_0800 + timedelta(hours=23, minutes=10))] == ["brief"]


def test_load_errors_name_the_routine(tmp_path):
    p = tmp_path / "r.toml"
    p.write_text('[[routine]]\nname = "Bad Name"\nschedule = "daily 07:00"\ngoal = "x"\n')
    with pytest.raises(ValueError, match="routine 0: name"):
        load_routines(p)
    p.write_text('[[routine]]\nname = "a"\nschedule = "daily 07:00"\n')
    with pytest.raises(ValueError, match="'a': missing 'goal'"):
        load_routines(p)
    p.write_text('[[routine]]\nname = "a"\nschedule = "daily 07:00"\ngoal = "x"\n[[routine]]\nname = "a"\nschedule = "daily 08:00"\ngoal = "y"\n')
    with pytest.raises(ValueError, match="twice"):
        load_routines(p)


def test_missing_file_is_no_routines(tmp_path):
    assert load_routines(tmp_path / "nope.toml") == []
