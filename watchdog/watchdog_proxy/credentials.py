"""Credential injection: agents never hold real secrets.

Agents send a placeholder (e.g. `x-api-key: injected-by-watchdog`). On an allowed request to a
matching host, the watchdog overwrites that header with the real value from its own
environment. A hijacked agent has no key to leak, and the key can only ever reach the hosts
configured for it.
"""

from __future__ import annotations

import fnmatch
from collections.abc import Mapping, MutableMapping
from dataclasses import dataclass
from typing import Any

from .policy import RequestContext


@dataclass(frozen=True)
class Credential:
    header: str
    env: str  # watchdog env var holding the secret
    hosts: tuple[str, ...]
    agents: tuple[str, ...] = ("*",)

    def applies_to(self, ctx: RequestContext) -> bool:
        return any(fnmatch.fnmatchcase(ctx.host, h) for h in self.hosts) and any(
            fnmatch.fnmatchcase(ctx.agent, a) for a in self.agents
        )


def load_credentials(raw: list[dict[str, Any]]) -> list[Credential]:
    creds = []
    for i, entry in enumerate(raw):
        try:
            hosts = entry["hosts"]
            creds.append(
                Credential(
                    header=entry["header"],
                    env=entry["env"],
                    hosts=tuple(h.lower() for h in ([hosts] if isinstance(hosts, str) else hosts)),
                    agents=tuple([entry["agents"]] if isinstance(entry.get("agents"), str) else entry.get("agents", ["*"])),
                )
            )
        except KeyError as e:
            raise ValueError(f"credential {i}: missing {e.args[0]!r}") from e
    return creds


def inject(
    headers: MutableMapping[str, str],
    ctx: RequestContext,
    creds: list[Credential],
    environ: Mapping[str, str],
) -> str | None:
    """Overwrite headers for every credential that applies. Returns a deny reason, or None.

    A credential that applies but has no secret configured fails the request rather than
    forwarding the agent's placeholder.
    """
    for cred in creds:
        if not cred.applies_to(ctx):
            continue
        secret = environ.get(cred.env)
        if not secret:
            return f"credential for {ctx.host} not configured (set {cred.env} for the watchdog)"
        headers[cred.header] = secret
    return None
