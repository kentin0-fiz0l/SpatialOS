"""Response-side hooks: the approved tag must only ever land on an approved response."""

import json

from mitmproxy import http
from mitmproxy.test import tflow

from addon import BLOCK_MARKER, Watchdog


def flow_with(status, body="", metadata=None):
    f = tflow.tflow(resp=True)
    f.response = http.Response.make(status, body)
    f.metadata.update(metadata or {})
    return f


def test_approved_response_is_tagged():
    f = flow_with(200, metadata={"watchdog_approved": True})
    Watchdog().response(f)
    assert f.response.headers["X-Watchdog-Decision"] == "approved"


def test_denied_held_request_keeps_its_deny_tag():
    f = flow_with(403, json.dumps({"error": "blocked_by_watchdog"}), metadata={"watchdog_approved": False})
    f.response.headers["X-Watchdog-Decision"] = "deny"
    Watchdog().response(f)
    assert f.response.headers["X-Watchdog-Decision"] == "deny"


def test_plain_allow_is_not_tagged():
    f = flow_with(200)
    Watchdog().response(f)
    assert "X-Watchdog-Decision" not in f.response.headers


def test_refused_connect_becomes_a_watchdog_403():
    f = flow_with(502, f"Cannot connect to x: {BLOCK_MARKER}: evil resolves to blocked address 127.0.0.1")
    Watchdog().http_connect_error(f)
    assert f.response.status_code == 403
    assert f.response.headers["X-Watchdog-Decision"] == "deny"
    assert f.response.reason == "Blocked by watchdog"


def test_ordinary_502_is_left_alone():
    f = flow_with(502, "Cannot connect to x: connection refused")
    Watchdog().http_connect_error(f)
    assert f.response.status_code == 502
