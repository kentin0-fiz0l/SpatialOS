# Researcher agent

A Claude tool-use loop (Claude Opus 5.5, Anthropic SDK tool runner) that runs in its own
container behind the [watchdog](../watchdog/). Every request it makes, Claude API calls
included, goes through the watchdog's policy, and it holds no real API key: the watchdog
injects it.

Tools: `fetch_url` (GET a page, HTML converted to text), `write_file` / `read_file` /
`list_files` (confined to `/workspace`, mounted from `agent/workspace/`). Deliberately no
Anthropic server-side tools such as web search: those run on Anthropic's servers, out of the
watchdog's sight.

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
