"""Human-in-the-loop approvals.

A held request gets a random id + secret token. The token only ever travels to the
human (ntfy notification or console), never back through the agent, so the agent
cannot approve its own actions. Approvals that aren't answered in time are denied.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Protocol

import aiohttp
from aiohttp import web

from .policy import RequestContext

log = logging.getLogger("watchdog.approvals")


@dataclass
class ApprovalRequest:
    id: str
    token: str
    ctx: RequestContext
    summary: str
    created: float = field(default_factory=time.time)

    def decide_url(self, base_url: str, decision: str) -> str:
        return f"{base_url.rstrip('/')}/decide/{self.id}?token={self.token}&decision={decision}"


class Notifier(Protocol):
    async def notify(self, req: ApprovalRequest, base_url: str) -> None: ...


class ConsoleNotifier:
    """Prints approve/deny commands. For local development without ntfy."""

    async def notify(self, req: ApprovalRequest, base_url: str) -> None:
        log.warning(
            "APPROVAL NEEDED [%s] %s\n  approve: curl -X POST '%s'\n  deny:    curl -X POST '%s'",
            req.ctx.agent,
            req.summary,
            req.decide_url(base_url, "allow"),
            req.decide_url(base_url, "deny"),
        )


class NtfyNotifier:
    """Push notification with Approve/Deny buttons via ntfy (https://ntfy.sh)."""

    def __init__(self, url: str, topic: str, token: str | None = None):
        self.url, self.topic, self.token = url.rstrip("/"), topic, token

    async def notify(self, req: ApprovalRequest, base_url: str) -> None:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        payload = {
            "topic": self.topic,
            "title": f"{req.ctx.agent} wants to {req.ctx.method} {req.ctx.host}",
            "message": req.summary,
            "priority": 4,
            "tags": ["robot"],
            "actions": [
                {"action": "http", "label": "Approve", "method": "POST",
                 "url": req.decide_url(base_url, "allow"), "clear": True},
                {"action": "http", "label": "Deny", "method": "POST",
                 "url": req.decide_url(base_url, "deny"), "clear": True},
            ],
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(self.url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                resp.raise_for_status()


class ApprovalBroker:
    def __init__(self, notifier: Notifier, public_url: str, timeout_s: float = 300):
        self.notifier = notifier
        self.public_url = public_url
        self.timeout_s = timeout_s
        self._pending: dict[str, tuple[ApprovalRequest, asyncio.Future[bool]]] = {}

    async def request(self, ctx: RequestContext, summary: str) -> tuple[bool, str]:
        """Hold until a human decides. Returns (approved, reason)."""
        req = ApprovalRequest(secrets.token_hex(8), secrets.token_urlsafe(24), ctx, summary)
        future: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
        self._pending[req.id] = (req, future)
        try:
            try:
                await self.notifier.notify(req, self.public_url)
            except Exception as e:  # nobody can approve what nobody was told about
                log.error("approval notification failed: %s", e)
                return False, f"notification failed: {e}"
            try:
                approved = await asyncio.wait_for(future, self.timeout_s)
            except asyncio.TimeoutError:
                return False, f"no answer within {self.timeout_s:.0f}s"
            return approved, "approved by human" if approved else "denied by human"
        finally:
            self._pending.pop(req.id, None)

    def resolve(self, approval_id: str, token: str, approved: bool) -> bool:
        entry = self._pending.get(approval_id)
        if entry is None:
            return False
        req, future = entry
        if not secrets.compare_digest(req.token, token) or future.done():
            return False
        future.set_result(approved)
        return True

    def pending(self) -> list[dict]:
        """Read-only view for dashboards. Never includes tokens."""
        return [
            {"id": r.id, "agent": r.ctx.agent, "method": r.ctx.method, "host": r.ctx.host,
             "path": r.ctx.path, "summary": r.summary, "age_s": round(time.time() - r.created)}
            for r, _ in self._pending.values()
        ]


def build_app(broker: ApprovalBroker, untrusted_sources: list[str], audit=None) -> web.Application:
    """HTTP endpoint the human's phone hits. Refuses callers from agent networks.

    `audit` (an AuditLog) enables GET /activity, the read-only feed for dashboards."""
    networks = [ipaddress.ip_network(cidr) for cidr in untrusted_sources]

    @web.middleware
    async def reject_agents(request: web.Request, handler):
        peer = request.remote
        if request.path != "/healthz" and peer and any(ipaddress.ip_address(peer) in net for net in networks):
            log.warning("approval endpoint hit from untrusted source %s", peer)
            raise web.HTTPForbidden()
        return await handler(request)

    async def decide(request: web.Request) -> web.Response:
        decision = request.query.get("decision")
        if decision not in ("allow", "deny"):
            raise web.HTTPBadRequest(text="decision must be allow or deny")
        ok = broker.resolve(request.match_info["id"], request.query.get("token", ""), decision == "allow")
        if not ok:
            raise web.HTTPNotFound(text="unknown, expired, or already decided")
        return web.json_response({"ok": True, "decision": decision})

    async def pending(_: web.Request) -> web.Response:
        return web.json_response(broker.pending())

    async def healthz(_: web.Request) -> web.Response:
        return web.json_response({"ok": True})

    async def activity(request: web.Request) -> web.Response:
        if audit is None:
            raise web.HTTPNotFound(text="no audit log configured")
        try:
            limit = max(1, min(int(request.query.get("limit", "50")), 500))
        except ValueError:
            raise web.HTTPBadRequest(text="limit must be an integer")
        return web.json_response({"activity": audit.tail(limit), "pending": broker.pending()})

    app = web.Application(middlewares=[reject_agents])
    app.add_routes([
        web.post("/decide/{id}", decide),
        web.get("/pending", pending),
        web.get("/activity", activity),
        web.get("/healthz", healthz),
    ])
    return app
