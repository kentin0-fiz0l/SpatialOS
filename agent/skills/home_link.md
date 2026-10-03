# Shared networking and safety rules (SpatialOS version)

Every device skill says "follow the shared HomeLink networking and safety rules in
`home_link.md`". This is that file. The skills were written for Meta's Muse Home Link; here
devices are reached through the SpatialOS watchdog instead, and these rules replace the
Home Link ones wherever a skill mentions them.

## How devices are reached

- There is no network discovery. mDNS/SSDP don't reach this container. The only devices
  that exist are the ones `list_devices` returns, with their IP, the skill to use, and any
  notes the owner left. "Fresh discovery" in a skill means: call `list_devices`.
- All requests go through the watchdog with `http_request` (any method) or `fetch_url`
  (GET only). Any LAN address not in the inventory is denied by the watchdog, whatever
  the skill says.
- Reads (GET/HEAD) to an inventoried device usually go straight through. Writes (PUT,
  POST, PATCH, DELETE) may be held until the owner approves on their phone. A held request
  can take a few minutes; wait for it.

## Credentials

- You never hold device credentials. Where a device needs a key or token, the inventory
  names the header to send (for example `hue-application-key`). Send the literal value
  `injected-by-watchdog` in that header; the watchdog replaces it with the real value.
- Never put a credential in a URL, a query string, a file, or a shell command. Never ask
  the owner to paste one into the chat.
- A skill's pairing steps (pressing a bridge button, reading back a key) are for the owner
  to do once, outside the agent. If a device has no credential configured, report that
  and stop; don't try to pair.

## Safety

- If the watchdog blocks a request, the response says so (`Blocked by watchdog: …`). Don't
  retry it, don't try another route to the same device, and don't try to reach it by a
  different address. Carry on with what you can and say what was blocked.
- Before an action that is hard to undo or affects the physical world (garage doors,
  locks, heating, anything that moves, printing, purchases), state exactly what you are
  about to do and to which device, then do it once. Never loop a physical action.
- Prefer the smallest change that does the job: one light, one scene, one volume step.
  Group writes only when the request clearly covers the group.
- Read state back after a write and report what actually changed, not what you sent.
- Devices with self-signed TLS certificates can't be verified through the watchdog yet. Use
  the device's plain-HTTP endpoint where the skill offers one; otherwise report that the
  device needs TLS support and stop.
