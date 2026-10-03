"""Device inventory: the allowlist for LAN traffic.

Agents may only reach private addresses that are listed here. Each device can also carry a
credential, which becomes a watchdog credential entry scoped to that device's address.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import Any

from .credentials import Credential

PRIVATE_NETWORKS = [
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "fc00::/7")  # 100.64/10: Tailscale
]


@dataclass(frozen=True)
class Device:
    name: str
    host: str  # IP address
    skill: str = ""
    notes: str = ""
    credential: Credential | None = None


def load_devices(raw: list[dict[str, Any]]) -> list[Device]:
    devices = []
    for i, entry in enumerate(raw):
        try:
            host = str(ipaddress.ip_address(entry["host"]))
        except KeyError as e:
            raise ValueError(f"device {i}: missing {e.args[0]!r}") from e
        except ValueError as e:
            raise ValueError(f"device {i}: 'host' must be an IP address") from e
        cred = None
        if c := entry.get("credential"):
            try:
                cred = Credential(header=c["header"], env=c["env"], hosts=(host,))
            except KeyError as e:
                raise ValueError(f"device {i}: credential missing {e.args[0]!r}") from e
        devices.append(Device(name=str(entry.get("name", host)), host=host, skill=entry.get("skill", ""),
                              notes=entry.get("notes", ""), credential=cred))
    return devices


class Inventory:
    def __init__(self, devices: list[Device]):
        self.devices = devices
        self._hosts = {d.host for d in devices}

    def blocks(self, ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
        """Deny reason for a resolved destination, or None if it may proceed."""
        if any(ip in net for net in PRIVATE_NETWORKS) and str(ip) not in self._hosts:
            return f"{ip} is a LAN address not in the device inventory"
        return None

    def credentials(self) -> list[Credential]:
        return [d.credential for d in self.devices if d.credential]
