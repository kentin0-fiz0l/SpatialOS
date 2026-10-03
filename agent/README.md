# Researcher agent

A Claude tool-use loop (Claude Opus 5.5, Anthropic SDK tool runner) that runs in its own
container behind the [watchdog](../watchdog/). Every request it makes, Claude API calls
included, goes through the watchdog's policy, and it holds no real API key: the watchdog
injects it.

Tools: `fetch_url` (GET a page, HTML converted to text), `http_request` (any method, for
device control and sending data), `list_devices` / `list_skills` / `read_skill`, and
`write_file` / `read_file` / `list_files` (confined to `/workspace`, mounted from
`agent/workspace/`). Deliberately no Anthropic server-side tools such as web search: those
run on Anthropic's servers, out of the watchdog's sight.

## Devices and skills

`skills/` holds 43 device-control recipes from Meta's open-source
[muse-gadget-sdk](https://github.com/facebookincubator/muse-gadget-sdk) (Apache 2.0, see
`skills/NOTICE.md`): Hue, Sonos, Google Cast, LG/Samsung TVs, printers, Roomba,
Zigbee2MQTT, Moonraker 3D printers and more. They were written for Muse Home Link; the
shared rules they defer to are ours, in `skills/home_link.md`, and describe the watchdog.

Devices come from `watchdog/devices.yaml`: name, IP, which skill, notes, and optionally a
credential header the watchdog fills in. The same file is the watchdog's LAN allowlist, so
the agent can only reach devices you listed. Reads go through; writes are held for your
approval. Example task:

```bash
docker compose exec researcher python agent.py "Dim the living room lights to 30%"
```

## Run

```bash
cd ../watchdog
# once: put your API key (console.anthropic.com; a Claude.ai subscription doesn't include API access)
#   ANTHROPIC_API_KEY=sk-ant-...   into watchdog/.env, then:
docker compose up -d --build --wait
docker compose exec researcher python agent.py "Research how DNS rebinding attacks work and write a one-page summary"
```

Output streams to the terminal; results land in `agent/workspace/`, with a full transcript
per run in `agent/workspace/runs/`. Exit code 0 means Claude finished; 2 means it stopped
early (iteration limit, refusal, or max tokens).

## Runner: start runs by voice or from the activity panel

`runner.py` is a small host process (Mac today, the hub Pi later) that starts runs with
`docker compose exec` and serves them over HTTP on loopback. It deliberately lives outside
the containers: the agent network has no route out, and that stays true.

```bash
python3 agent/runner.py            # http://127.0.0.1:8791
curl -s -X POST localhost:8791/runs -H 'Content-Type: application/json' -d '{"goal": "..."}'
curl -s localhost:8791/runs        # newest first
curl -s localhost:8791/runs/<id>   # status, summary, output
```

Who uses it:
- The MCP voice bridge's `delegate_to_agent` and `agent_run_status` tools, so "research X
  and write a summary" said to voice-harness starts a run and can report back.
- The SpatialOS activity panel (via Vite's `/runner` proxy): running and finished runs show
  next to the watchdog's audit log.

Output per run lands in `agent/runs/<id>.log`; the agent's own transcript is still in
`agent/workspace/runs/`.

## Settings (environment, set in watchdog/docker-compose.yml)

| Variable | Default | |
|---|---|---|
| `AGENT_MODEL` | `claude-opus-5-5` | |
| `AGENT_EFFORT` | `high` | `low`–`max`; lower is cheaper and faster |
| `AGENT_MAX_ITERATIONS` | `30` | model calls per run |
| `AGENT_HTTP_TIMEOUT` | `330` | seconds; must outlast the watchdog's approval timeout |
| `AGENT_CONTACT` | empty | added to the User-Agent, e.g. `mailto:you@example.com` |

Server-side refusal fallbacks (`fallbacks: "default"`) are on: if a request is declined by a
safety classifier, the API retries it on a fallback model within the same call.
