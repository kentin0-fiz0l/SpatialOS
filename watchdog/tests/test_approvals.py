import asyncio

from watchdog_proxy.approvals import ApprovalBroker
from watchdog_proxy.policy import RequestContext

CTX = RequestContext(agent="scout", method="POST", host="gmail.googleapis.com", path="/send")


class CapturingNotifier:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    async def notify(self, req, base_url):
        if self.fail:
            raise RuntimeError("ntfy down")
        self.sent.append(req)


async def _decide_when_notified(broker, notifier, token_for, approved):
    while not notifier.sent:
        await asyncio.sleep(0)
    req = notifier.sent[0]
    return broker.resolve(req.id, token_for(req), approved)


def run(broker, notifier, token_for=lambda r: r.token, approved=True):
    async def main():
        decider = asyncio.create_task(_decide_when_notified(broker, notifier, token_for, approved))
        result = await broker.request(CTX, "summary")
        return result, await decider
    return asyncio.run(main())


def test_correct_token_approves():
    n = CapturingNotifier()
    (approved, reason), resolved = run(ApprovalBroker(n, "http://x", timeout_s=1), n)
    assert resolved and approved and reason == "approved by human"


def test_human_can_deny():
    n = CapturingNotifier()
    (approved, _), _ = run(ApprovalBroker(n, "http://x", timeout_s=1), n, approved=False)
    assert not approved


def test_wrong_token_cannot_approve_and_request_times_out():
    n = CapturingNotifier()
    (approved, reason), resolved = run(ApprovalBroker(n, "http://x", timeout_s=0.05), n, token_for=lambda r: "guess")
    assert not resolved and not approved and "no answer" in reason


def test_notification_failure_denies_immediately():
    broker = ApprovalBroker(CapturingNotifier(fail=True), "http://x", timeout_s=5)
    approved, reason = asyncio.run(broker.request(CTX, "summary"))
    assert not approved and "notification failed" in reason


def test_pending_view_hides_tokens():
    n = CapturingNotifier()
    broker = ApprovalBroker(n, "http://x", timeout_s=1)

    async def main():
        task = asyncio.create_task(broker.request(CTX, "summary"))
        while not n.sent:
            await asyncio.sleep(0)
        view = broker.pending()
        broker.resolve(n.sent[0].id, n.sent[0].token, False)
        await task
        return view

    view = asyncio.run(main())
    assert len(view) == 1 and "token" not in view[0]
