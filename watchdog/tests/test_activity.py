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


def test_operator_decide(tmp_path):
    from watchdog_proxy.policy import RequestContext as RC

    class Capture:
        def __init__(self):
            self.sent = []

        async def notify(self, req, base_url):
            self.sent.append(req)

    notifier = Capture()
    broker = ApprovalBroker(notifier, "http://x", timeout_s=5)
    app = build_app(broker, [], operator_key="secret-key")

    async def main():
        async with TestClient(TestServer(app)) as client:
            hold = asyncio.create_task(broker.request(RC("scout", "POST", "x.example", "/send"), "s"))
            while not notifier.sent:
                await asyncio.sleep(0)
            rid = notifier.sent[0].id
            wrong = await client.post(f"/operator/decide/{rid}?decision=allow", headers={"X-Operator-Key": "nope"})
            nokey = await client.post(f"/operator/decide/{rid}?decision=allow")
            bad = await client.post(f"/operator/decide/{rid}?decision=maybe", headers={"X-Operator-Key": "secret-key"})
            ok = await client.post(f"/operator/decide/{rid}?decision=deny", headers={"X-Operator-Key": "secret-key"})
            again = await client.post(f"/operator/decide/{rid}?decision=allow", headers={"X-Operator-Key": "secret-key"})
            approved, reason = await hold
            return wrong.status, nokey.status, bad.status, ok.status, again.status, approved, reason

    wrong, nokey, bad, ok, again, approved, reason = asyncio.run(main())
    assert (wrong, nokey, bad, ok, again) == (403, 403, 400, 200, 404)
    assert approved is False and reason == "denied by human"


def test_operator_endpoint_disabled_without_key():
    app = build_app(ApprovalBroker(ConsoleNotifier(), "http://x"), [])

    async def main():
        async with TestClient(TestServer(app)) as client:
            return (await client.post("/operator/decide/abc?decision=allow", headers={"X-Operator-Key": ""})).status

    assert asyncio.run(main()) == 403
