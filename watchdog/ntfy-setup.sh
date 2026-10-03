#!/usr/bin/env bash
# Set up self-hosted ntfy for phone approvals. Safe to re-run.
#
#   ./ntfy-setup.sh                         # local only (127.0.0.1), for testing
#   ./ntfy-setup.sh my-mac.tail1234.ts.net  # tailnet: also configures `tailscale serve`
#
# Creates (once): ntfy user "iphone" (read-only on the topic) and user "watchdog" with a
# write-only access token. Secrets go to .env and secrets/, never to the terminal.
set -euo pipefail
cd "$(dirname "$0")"

TOPIC=watchdog-approvals
TAILNET_HOST=${1:-}

set_env() {  # set_env KEY VALUE  -> upsert into .env
  touch .env
  grep -v "^$1=" .env > .env.tmp || true
  echo "$1=$2" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
}

env_get() { grep "^$1=" .env 2>/dev/null | cut -d= -f2- || true; }

ntfy_cli() { docker compose exec -T ntfy ntfy "$@" </dev/null; }
ntfy_add_user() { docker compose exec -T -e NTFY_PASSWORD="$2" ntfy ntfy user add "$1" </dev/null >/dev/null; }

if [[ -n $TAILNET_HOST ]]; then
  set_env NTFY_BASE_URL "https://$TAILNET_HOST"
  set_env WATCHDOG_PUBLIC_URL "https://$TAILNET_HOST:8443"
  if command -v tailscale >/dev/null; then
    tailscale serve --bg --https=443 http://127.0.0.1:8091
    tailscale serve --bg --https=8443 http://127.0.0.1:8790
    echo "tailscale serve: https://$TAILNET_HOST -> ntfy, https://$TAILNET_HOST:8443 -> approvals"
  else
    echo "tailscale CLI not found; run the two 'tailscale serve' commands from the README yourself."
  fi
else
  # Refresh local defaults, but keep tailnet URLs from an earlier run.
  [[ $(env_get NTFY_BASE_URL) == https://* ]] || set_env NTFY_BASE_URL "http://127.0.0.1:8091"
  [[ $(env_get WATCHDOG_PUBLIC_URL) == https://* ]] || set_env WATCHDOG_PUBLIC_URL "http://127.0.0.1:8790"
fi

mkdir -p secrets ntfy
chmod 700 secrets
docker compose up -d --wait ntfy >/dev/null

users=$(ntfy_cli user list 2>&1)

if ! grep -q "user iphone" <<<"$users"; then
  pw=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  ntfy_add_user iphone "$pw"
  umask 077; echo "$pw" > secrets/ntfy-iphone-password
  echo "created ntfy user 'iphone' (password in secrets/ntfy-iphone-password)"
fi
ntfy_cli access iphone "$TOPIC" read-only >/dev/null

if ! grep -q "user watchdog" <<<"$users"; then
  ntfy_add_user watchdog "$(openssl rand -hex 24)"
  echo "created ntfy user 'watchdog'"
fi
ntfy_cli access watchdog "$TOPIC" write-only >/dev/null

if ! grep -q '^NTFY_TOKEN=tk_' .env 2>/dev/null; then
  token=$(ntfy_cli token add watchdog | grep -o 'tk_[A-Za-z0-9]*')
  set_env NTFY_TOKEN "$token"
  echo "created watchdog publish token (in .env)"
fi

docker compose up -d --wait >/dev/null
echo "ready: topic '$TOPIC' on $(env_get NTFY_BASE_URL), approvals at $(env_get WATCHDOG_PUBLIC_URL)"
