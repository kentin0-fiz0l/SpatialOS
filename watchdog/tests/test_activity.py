import asyncio
import json

from aiohttp.test_utils import TestClient, TestServer

from watchdog_proxy.approvals import ApprovalBroker, ConsoleNotifier, build_app
from watchdog_proxy.audit import AuditLog
from watchdog_proxy.policy import Decision, RequestContext, Verdict


def test_tail_returns_recent_records_oldest_first(tmp_path):
    log = AuditLog(tmp_path / "audit.jsonl")
    for i in range(5):
        log.write(RequestContext("scout", "GET", f"h{i}.example", "/"), Verdict(Decision.ALLOW, "r"))
    assert [r["host"] for r in log.tail(2)] == ["h3.example", "h4.example"]


def test_tail_skips_a_torn_last_line(tmp_path):
    log = AuditLog(tmp_path / "audit.jsonl")
    log.write(RequestContext("scout", "GET", "ok.example", "/"), Verdict(Decision.ALLOW, "r"))
    with log.path.open("a") as f:
        f.write('{"ts": 1, "host": "half')
    assert [r["host"] for r in log.tail(10)] == ["ok.example"]


def test_tail_of_missing_file_is_empty(tmp_path):
    assert AuditLog(tmp_path / "nope.jsonl").tail(5) == []


def test_activity_endpoint(tmp_path):
    log = AuditLog(tmp_path / "audit.jsonl")
    log.write(RequestContext("scout", "POST", "x.example", "/send"), Verdict(Decision.DENY, "nope"))
    app = build_app(ApprovalBroker(ConsoleNotifier(), "http://x"), [], audit=log)

    async def main():
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/activity?limit=10")
            body = await resp.json()
            bad = await client.get("/activity?limit=abc")
            return resp.status, body, bad.status

    status, body, bad = asyncio.run(main())
    assert status == 200 and bad == 400
    assert body["pending"] == []
    assert body["activity"][0]["host"] == "x.example" and body["activity"][0]["decision"] == "deny"
