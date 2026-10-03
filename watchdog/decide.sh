#!/usr/bin/env bash
# Approve or deny the most recent held request from this machine, the way the phone would:
# read the ntfy notification and POST its Approve/Deny action.
#
#   ./decide.sh            # show pending notifications
#   ./decide.sh allow      # approve the latest
#   ./decide.sh deny       # deny the latest
set -euo pipefail
cd "$(dirname "$0")"
TOPIC=watchdog-approvals
NTFY=${NTFY_LOCAL_URL:-http://127.0.0.1:8091}
PW_FILE=secrets/ntfy-iphone-password
[[ -r $PW_FILE ]] || { echo "no $PW_FILE; run ./ntfy-setup.sh first" >&2; exit 1; }

msgs=$(curl -s -u "iphone:$(<"$PW_FILE")" "$NTFY/$TOPIC/json?poll=1&since=10m" | grep '"actions"' || true)
[[ -n $msgs ]] || { echo "no held requests in the last 10 minutes"; exit 0; }

if [[ ${1:-} == "" ]]; then
  python3 -c '
import json, sys
for line in sys.stdin:
    m = json.loads(line); print(f"- {m[\"title\"]}\n    {m[\"message\"].splitlines()[0]}")' <<<"$msgs"
  exit 0
fi
[[ $1 == allow || $1 == deny ]] || { echo "usage: $0 [allow|deny]" >&2; exit 2; }
label=$([[ $1 == allow ]] && echo Approve || echo Deny)
url=$(tail -1 <<<"$msgs" | python3 -c "
import json, sys; m = json.loads(sys.stdin.read())
print(next(a['url'] for a in m['actions'] if a['label'] == '$label'))")
curl -s -X POST "$url"; echo
