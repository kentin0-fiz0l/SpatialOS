# Watchdog

Egress gate for SpatialOS agents. Every outbound HTTP(S) request an agent makes passes
through this proxy and gets **allowed**, **denied**, or **held for human approval**.
The model never sees the approval channel, so a prompt-injected agent can't approve itself.

```
agent container ──(internal net, no route out)──► watchdog :8080 ──► internet
                                                      │
                                    ntfy push ◄───────┤ ask
                       phone taps Approve ──► :8765 /decide/{id}?token=…
```

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
cp watchdog.example.yaml watchdog.yaml
PYTHONUNBUFFERED=1 .venv/bin/mitmdump -s addon.py --set watchdog_config=watchdog.yaml

# in another shell (-k because the mitmproxy CA isn't trusted yet)
curl -k -x http://127.0.0.1:8080 https://en.wikipedia.org/        # allow
curl -k -x http://127.0.0.1:8080 https://www.amazon.com/          # 403 deny
curl -k -x http://127.0.0.1:8080 -X POST \
  https://gmail.googleapis.com/gmail/v1/users/me/messages/send    # held; approve URL printed in proxy log
```

With no `approvals.ntfy.url` set, approve/deny commands are printed to the proxy log.

## Run with Docker (agent isolation)

```bash
cp watchdog.example.yaml watchdog.yaml
# in watchdog.yaml: approvals.listen_host: 0.0.0.0, and uncomment 127.0.0.0/8 under untrusted_sources
docker compose up -d --build --wait
./ntfy-setup.sh            # first time: ntfy users + token (see "Phone approvals")
./isolation-test.sh        # 21 checks: allowed paths work, every escape attempt is 403/000, phone flow approves
docker compose down
```

## Phone approvals (iPhone + Tailscale)

Held requests become push notifications with **Approve / Deny** buttons. ntfy runs in the
compose stack with deny-all access; the phone has a read-only user, the watchdog a write-only
token. Both services bind to 127.0.0.1 and reach your phone only through `tailscale serve`.

```
watchdog ──► ntfy (control net) ──wake-up ping, message ID only──► ntfy.sh ──► APNs ──► iPhone
   ▲                       ▲                                                         │
   │                       └──── app fetches the full message over Tailscale ◄───────┤
   └──── tap Approve: https://<mac>.ts.net:8443/decide/… ◄───────────────────────────┘
```

1. **Tailscale on both devices** (same account): `brew install --cask tailscale` on the Mac,
   the Tailscale app on the iPhone.
2. In the Tailscale admin console → **DNS**: enable **MagicDNS** and **HTTPS Certificates**.
3. Find the Mac's tailnet name: `tailscale status` (e.g. `my-mac.tail1234.ts.net`).
4. `./ntfy-setup.sh my-mac.tail1234.ts.net`. This configures `tailscale serve`
   (`:443` → ntfy, `:8443` → approvals), writes the URLs to `.env`, and restarts the stack.
5. **iPhone**: install **ntfy** from the App Store, then:
   - Settings → Users → add user for `https://my-mac.tail1234.ts.net`:
     username `iphone`, password from `secrets/ntfy-iphone-password`
   - **+** → topic `watchdog-approvals`, "Use another server" → `https://my-mac.tail1234.ts.net`
   - allow notifications
6. Test it:
   ```bash
   docker compose exec scout curl -s -X POST -d x --max-time 300 \
     https://gmail.googleapis.com/gmail/v1/users/me/messages/send
   ```
   Your phone buzzes; tap Approve and curl returns (401 from Google = it got through).

Run `./ntfy-setup.sh` with no argument for local-only testing (`127.0.0.1`). Without ntfy
configured at all (`approvals.ntfy.url: ""`), approve/deny URLs print to the watchdog log.

**Agent HTTP timeouts must exceed `approvals.timeout_seconds`.** A held request is an open
connection waiting for you; clients that give up after 30–60s will see a dropped connection
even if you approve.

## Config

See `watchdog.example.yaml`. Rules are first-match-wins with globs on `hosts`, `methods`,
`paths` and `agents`. Requests no rule matches go to `decide_unmatched()` in
`watchdog_proxy/policy.py`: small reads (GET/HEAD/OPTIONS, no body, query ≤ 256 bytes)
pass, everything else asks, and clients not listed under `agents` are denied.

## Checks

Hard gates run before any rule and can't be overridden by one:

- Clients not listed under `agents` are denied everything.
- The approval server and ntfy host are always denied to agents.
- Destinations are resolved and refused if they land in `blocked_destinations` (loopback,
  link-local/cloud metadata, the agent subnet), however the host is spelled.
  This is checked again on the connection itself, which is then pinned to the checked IP,
  so a DNS server answering differently the second time (rebinding) can't redirect it.

Then:

- Policy matches the real connection target, not the spoofable `Host` header.
- The approval endpoint refuses callers from `untrusted_sources` (in Docker, that includes
  loopback, since the only loopback caller inside the container is the proxy).
- Approval tokens are single-use and compared in constant time; unanswered requests are denied after `timeout_seconds`.
- If the notification fails, the request is denied.
- Every decision goes to `data/audit.jsonl`.

## Known gaps

- WebSocket messages and non-HTTP TCP aren't inspected (the internal Docker network blocks other routes out).
- Apps that pin certificates will fail through the proxy.
- No credential injection yet: secrets still live in the agent.
- No content-level risk scoring yet (planned: System One classifier on request bodies).

## Tests

```bash
.venv/bin/pytest -q
```
