"""Connect-time destination check: the IP actually dialed must pass, and gets pinned."""

import asyncio
import ipaddress
import socket

from mitmproxy.proxy.server_hooks import ServerConnectionHookData
from mitmproxy.test import tflow

from addon import DEFAULT_BLOCKED_DESTINATIONS, Watchdog

PUBLIC = "93.184.215.14"


class RecordingAudit:
    def __init__(self):
        self.rows = []

    def write(self, ctx, verdict):
        self.rows.append((ctx, verdict))


def answer(*ips):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in ips]


def watchdog(*answers):
    """Watchdog whose resolver returns each answer in turn, like a rebinding DNS server."""
    wd = Watchdog()
    wd.blocked_destinations = [ipaddress.ip_network(c) for c in DEFAULT_BLOCKED_DESTINATIONS]
    wd.audit = RecordingAudit()
    queue = list(answers)

    async def fake_getaddrinfo(host, port, **kwargs):
        result = queue.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    wd._getaddrinfo = fake_getaddrinfo
    return wd


def connect(wd, host, port=443, sni=None):
    server = tflow.tserver_conn()
    server.address = (host, port)
    server.sni = sni
    server.error = None
    asyncio.run(wd.server_connect(ServerConnectionHookData(client=tflow.tclient_conn(), server=server)))
    return server


def test_rebinding_between_check_and_connect_is_blocked():
    wd = watchdog(answer(PUBLIC), answer("127.0.0.1"))
    _, reason = asyncio.run(wd._resolve_allowed("rebind.example", 8765))
    assert reason is None  # request-time check sees the public answer...
    server = connect(wd, "rebind.example", 8765)
    assert "127.0.0.1" in server.error  # ...but the connection is refused
    assert server.address == ("rebind.example", 8765)


def test_allowed_connection_is_pinned_to_checked_ip():
    server = connect(watchdog(answer(PUBLIC)), "example.com")
    assert server.error is None
    assert server.address == (PUBLIC, 443)
    assert server.sni == "example.com"  # certificate is still checked against the hostname


def test_pinned_connection_remembers_hostname_for_policy():
    wd = watchdog(answer(PUBLIC))
    server = connect(wd, "www.amazon.com")
    assert wd._pinned_hosts[server.id] == "www.amazon.com"
    wd.server_disconnected(ServerConnectionHookData(client=tflow.tclient_conn(), server=server))
    assert server.id not in wd._pinned_hosts


def test_existing_sni_is_kept():
    server = connect(watchdog(answer(PUBLIC)), "example.com", sni="client-sent.example")
    assert server.sni == "client-sent.example"


def test_ip_literal_is_left_alone():
    server = connect(watchdog(answer(PUBLIC)), PUBLIC)
    assert server.address == (PUBLIC, 443) and server.sni is None


def test_any_blocked_answer_blocks_the_name():
    server = connect(watchdog(answer(PUBLIC, "169.254.169.254")), "mixed.example")
    assert "169.254.169.254" in server.error


def test_resolution_failure_blocks():
    server = connect(watchdog(OSError("nxdomain")), "missing.example")
    assert "could not resolve" in server.error


def test_ipv4_mapped_ipv6_is_checked_as_ipv4():
    mapped = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::ffff:127.0.0.1", 0, 0, 0))]
    wd = watchdog(mapped)
    server = connect(wd, "sneaky.example", 8765)
    assert "127.0.0.1" in server.error


def test_connect_time_block_is_audited_and_marked():
    wd = watchdog(answer("127.0.0.1"))
    wd.agents = {"127.0.0.1": "scout"}
    server = connect(wd, "evil.example", 80)
    assert server.error.startswith("blocked_by_watchdog:")
    (ctx, verdict), = wd.audit.rows
    assert ctx.method == "CONNECT" and ctx.host == "evil.example" and verdict.decision.value == "deny"
