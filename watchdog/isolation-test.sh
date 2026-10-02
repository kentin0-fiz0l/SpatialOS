#!/usr/bin/env bash
# End-to-end isolation test against the running Docker setup. Every "escape attempt" should be 403 or 000.
# Requires watchdog.yaml with approvals.listen_host 0.0.0.0 and 127.0.0.0/8 under untrusted_sources.
cd "$(dirname "$0")"
docker compose up -d --build --wait >/dev/null 2>&1 || { echo "compose up failed"; docker compose logs --tail 20; exit 1; }
: > data/audit.jsonl
S()  { docker compose exec -T scout curl -s -o /dev/null -w %{http_code} --max-time 8 "$@" </dev/null; }
SP() { S --noproxy '' -x http://172.30.0.2:8080 "$@"; }   # force through proxy, even for localhost
echo "── through the proxy ──"
echo " 1 allowed rule (wikipedia):            $(S https://en.wikipedia.org/wiki/Main_Page)"
echo " 2 denied rule (amazon):                $(S https://www.amazon.com/)"
echo " 3 unmatched small read (example.com):  $(S https://example.com/)"
echo " 4 TLS verified with watchdog CA:       $(docker compose exec -T scout curl -s -o /dev/null -w '%{ssl_verify_result}' https://en.wikipedia.org/ </dev/null) (0 = verified, no -k)"
echo "── escape attempts (all should fail) ──"
echo " 5 bypass proxy, go direct:             $(S --noproxy '*' https://en.wikipedia.org/)"
echo " 6 direct to approval server:           $(S --noproxy '*' http://172.30.0.2:8765/pending)"
echo " 7 approvals via proxy, localhost:      $(SP http://localhost:8765/pending)"
echo " 8 approvals via proxy, 127.0.0.1:      $(SP http://127.0.0.1:8765/pending)"
echo " 9 approvals via proxy, 0x7f.1:         $(SP http://0x7f.1:8765/pending)"
echo "10 approvals via proxy, localtest.me:   $(SP http://localtest.me:8765/pending)  (public DNS -> 127.0.0.1)"
echo "11 approvals via proxy, 172.30.0.2:     $(SP http://172.30.0.2:8765/pending)"
echo "12 cloud metadata 169.254.169.254:      $(SP http://169.254.169.254/latest/meta-data/)"
echo "13 agent-to-agent (scout -> itself):    $(SP http://172.30.0.10:80/)"
echo "14a ntfy via proxy (by name):          $(SP 'http://ntfy/watchdog-approvals/json?poll=1')"
echo "14b ntfy via proxy (by IP):            $(SP 'http://172.31.0.3/watchdog-approvals/json?poll=1')"
echo "14c ntfy direct, no proxy:             $(S --noproxy '*' http://172.31.0.3/)"
echo "14 unregistered container:              $(docker run --rm --network watchdog_agents curlimages/curl -s -o /dev/null -w %{http_code} --max-time 8 -k -x http://172.30.0.2:8080 https://en.wikipedia.org/ </dev/null)"
echo "── human side ──"
echo "15 host -> /healthz:                    $(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:8765/healthz)"
echo "16 host -> /pending:                    $(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:8765/pending)"
# Approve the way the phone does: read the ntfy notification, POST its Approve action.
# Uses a throwaway read-only ntfy user so the real phone password is never needed.
PW=$(openssl rand -hex 16)
docker compose exec -T -e NTFY_PASSWORD="$PW" ntfy ntfy user add e2e-phone </dev/null >/dev/null
docker compose exec -T ntfy ntfy access e2e-phone watchdog-approvals read-only </dev/null >/dev/null
N=http://127.0.0.1:8091/watchdog-approvals
echo "17 ntfy anonymous read:                $(curl -s -o /dev/null -w %{http_code} "$N/json?poll=1")"
SINCE=$(date +%s)   # only this run's notification, not one left over from an earlier run
( S --max-time 120 -X POST -d '{"raw":"aGk="}' https://gmail.googleapis.com/gmail/v1/users/me/messages/send > data/ask.out ) &
CURL=$!
for i in $(seq 1 40); do
  MSG=$(curl -s -u e2e-phone:$PW "$N/json?poll=1&since=$SINCE" | grep '"actions"' | tail -1)
  [[ -n $MSG ]] && break; sleep 0.5
done
APPROVE=$(python3 -c "import json,sys; m=json.loads(sys.argv[1]); print(next(a['url'] for a in m['actions'] if a['label']=='Approve'))" "$MSG")
echo "18 phone taps Approve:                 $(curl -s -X POST "$APPROVE")"
wait $CURL
echo "19 gmail send after approval:          $(cat data/ask.out)  (401 = reached Google, no creds)"
docker compose exec -T ntfy ntfy user del e2e-phone </dev/null >/dev/null
echo; echo "── audit ──"
python3 -c "import json;[print(' ',r['decision'].ljust(5),r['agent'].ljust(22),(r['host']+r['path'])[:45].ljust(46),'|',r['reason']) for r in map(json.loads,open('data/audit.jsonl'))]"
