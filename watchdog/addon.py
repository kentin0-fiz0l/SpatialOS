"""Watchdog: mitmproxy addon that gates every outbound request an agent makes.

    mitmdump -s addon.py --set watchdog_config=watchdog.yaml

Order of checks per request:
  1. hard gates, which rules can't override:
     - client IP not registered under `agents` -> denied
     - control plane (approval server, ntfy) -> denied
     - destination resolves into `blocked_destinations` (loopback, metadata, agent net) -> denied
  2. policy rules -> allow / deny / ask
  3. ask -> hold the request until a human approves, denies, or it times out

The destination check runs twice: in `request` for a readable 403, and in `server_connect`
on the address actually dialed, which is then pinned to the checked IP. Without the second
check, mitmproxy would resolve the name again and a DNS server could answer differently
(rebinding).
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import socket
from urllib.parse import urlsplit

import yaml
from aiohttp import web
from mitmproxy import ctx as mitm_ctx
from mitmproxy import http
from mitmproxy.proxy import server_hooks

from watchdog_proxy.approvals import ApprovalBroker, ConsoleNotifier, NtfyNotifier, build_app
from watchdog_proxy.audit import AuditLog
from watchdog_proxy.credentials import Credential, inject, load_credentials
from watchdog_proxy.policy import Decision, Policy, RequestContext, Verdict, load_rules

log = logging.getLogger("watchdog")

SUMMARY_BODY_CHARS = 300
DEFAULT_BLOCKED_DESTINATIONS = ["127.0.0.0/8", "::1/128", "0.0.0.0/8", "169.254.0.0/16", "fe80::/10"]


class Watchdog:
    def __init__(self):
        self.policy: Policy | None = None
        self.broker: ApprovalBroker | None = None
        self.audit: AuditLog | None = None
        self.agents: dict[str, str] = {}
        self.protected: set[str] = set()
        self.blocked_destinations: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
        self.credentials: list[Credential] = []
        self._pinned_hosts: dict[str, str] = {}  # server connection id -> hostname it was pinned from
        self.ua_suffix = ""
        self._runner: web.AppRunner | None = None

    def load(self, loader):
        loader.add_option("watchdog_config", str, "watchdog.yaml", "Path to the watchdog YAML config.")

    async def running(self):
        with open(mitm_ctx.options.watchdog_config) as f:
            cfg = yaml.safe_load(f)

        self.policy = Policy(load_rules(cfg.get("rules", [])))
        self.credentials = load_credentials(cfg.get("credentials", []))
        self.audit = AuditLog(cfg.get("audit_log", "data/audit.jsonl"))
        self.agents = cfg.get("agents", {})
        self.ua_suffix = cfg.get("identity", {}).get("user_agent_suffix", "")

        appr = cfg.get("approvals", {})
        # Env wins so the tailnet hostname can live in .env next to the compose file.
        public_url = os.environ.get("WATCHDOG_PUBLIC_URL") or appr.get("public_url", "http://127.0.0.1:8765")
        ntfy = appr.get("ntfy") or {}
        if ntfy.get("url"):
            notifier = NtfyNotifier(ntfy["url"], ntfy["topic"], os.environ.get(ntfy.get("token_env", "NTFY_TOKEN")))
        else:
            notifier = ConsoleNotifier()
        self.broker = ApprovalBroker(notifier, public_url, appr.get("timeout_seconds", 300))

        # Agents must never reach the approval server or the notification channel.
        self.protected = {h.lower() for h in cfg.get("protected_hosts", [])}
        pub = urlsplit(public_url)
        self.protected.add(f"{pub.hostname}:{pub.port or 80}")
        if ntfy.get("url"):
            self.protected.add(urlsplit(ntfy["url"]).hostname.lower())
        self.blocked_destinations = [
            ipaddress.ip_network(c) for c in cfg.get("blocked_destinations", DEFAULT_BLOCKED_DESTINATIONS)
        ]

        app = build_app(self.broker, appr.get("untrusted_sources", []))
        self._runner = web.AppRunner(app, access_log=None)  # access log would record approval tokens
        await self._runner.setup()
        host, port = appr.get("listen_host", "127.0.0.1"), appr.get("listen_port", 8765)
        await web.TCPSite(self._runner, host, port).start()
        log.info("watchdog ready: %d rules, approvals on %s:%s, notifier=%s",
                 len(self.policy.rules), host, port, type(notifier).__name__)

    async def done(self):
        if self._runner:
            await self._runner.cleanup()

    async def request(self, flow: http.HTTPFlow):
        req = flow.request
        client_ip = flow.client_conn.peername[0]
        agent = self.agents.get(client_ip)
        # Connection target, not the spoofable Host header. Inside a CONNECT tunnel mitmproxy
        # derives req.host from the server address, which server_connect pinned to an IP;
        # the policy needs the name that was resolved and dialed.
        host = self._pinned_hosts.get(flow.server_conn.id, req.host)
        ctx = RequestContext(
            agent=agent or f"unregistered:{client_ip}",
            method=req.method.upper(),
            host=host.lower(),
            path=req.path.split("?", 1)[0],
            body_size=len(req.raw_content or b""),
            query_size=len(req.path.partition("?")[2]),
        )

        if agent is None:
            verdict = Verdict(Decision.DENY, f"client {client_ip} is not a registered agent")
        elif self._is_protected(ctx.host, req.port):
            verdict = Verdict(Decision.DENY, "watchdog control plane is off-limits to agents")
        elif (reason := (await self._resolve_allowed(ctx.host, req.port))[1]):
            verdict = Verdict(Decision.DENY, reason)
        else:
            verdict = self.policy.evaluate(ctx)
            if verdict.decision is Decision.ASK:
                approved, why = await self.broker.request(ctx, self._summarize(flow))
                verdict = Verdict(Decision.ALLOW if approved else Decision.DENY, why, verdict.rule)
            # Secrets go in only after every gate and rule has passed.
            if verdict.decision is Decision.ALLOW and (missing := inject(req.headers, ctx, self.credentials, os.environ)):
                verdict = Verdict(Decision.DENY, missing, verdict.rule)

        self.audit.write(ctx, verdict)
        if verdict.decision is Decision.DENY:
            flow.response = http.Response.make(
                403,
                json.dumps({"error": "blocked_by_watchdog", "reason": verdict.reason}),
                {"Content-Type": "application/json", "X-Watchdog-Decision": "deny"},
            )
        elif self.ua_suffix:
            # Identify as an agent honestly; sites blocking unidentified agents is a real failure mode.
            req.headers["User-Agent"] = f"{req.headers.get('User-Agent', '')} {self.ua_suffix}".strip()

    def _is_protected(self, host: str, port: int) -> bool:
        return host in self.protected or f"{host}:{port}" in self.protected

    async def server_connect(self, data: server_hooks.ServerConnectionHookData):
        """Enforce blocked_destinations on the connection itself, then pin it to the checked IP."""
        host, port = data.server.address
        ip, reason = await self._resolve_allowed(host, port)
        if reason:
            data.server.error = reason  # mitmproxy aborts before dialing
            return
        if ip != host:
            data.server.sni = data.server.sni or host  # TLS must still verify the real hostname
            data.server.address = (ip, port)
            self._pinned_hosts[data.server.id] = host

    def server_disconnected(self, data: server_hooks.ServerConnectionHookData):
        self._pinned_hosts.pop(data.server.id, None)

    async def _resolve_allowed(self, host: str, port: int) -> tuple[str | None, str | None]:
        """Resolve once and refuse internal addresses, however the host is spelled.

        Returns (ip to connect to, None) or (None, reason). Names like `localhost` or `0x7f.1`
        or a DNS record pointing at 127.0.0.1 all land here. If any answer is blocked, the
        whole name is: a record mixing public and internal addresses is itself suspicious.
        """
        try:
            infos = await self._getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except OSError as e:
            return None, f"could not resolve {host}: {e}"
        ips = [ipaddress.ip_address(sockaddr[0]) for *_, sockaddr in infos]
        for ip in ips:
            if any(ip in net for net in self.blocked_destinations):
                return None, f"{host} resolves to blocked address {ip}"
        if not ips:
            return None, f"could not resolve {host}"
        return str(ips[0]), None

    async def _getaddrinfo(self, host, port, **kwargs):
        return await asyncio.get_running_loop().getaddrinfo(host, port, **kwargs)

    @staticmethod
    def _summarize(flow: http.HTTPFlow) -> str:
        req = flow.request
        body = (req.get_text(strict=False) or "")[:SUMMARY_BODY_CHARS]
        return f"{req.method} {req.pretty_url}" + (f"\n\n{body}" if body else "")


addons = [Watchdog()]
