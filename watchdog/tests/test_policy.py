import pytest

from watchdog_proxy.policy import (
    MAX_UNREVIEWED_QUERY,
    Decision,
    Policy,
    RequestContext,
    decide_unmatched,
    load_rules,
)


def ctx(method="GET", host="example.com", path="/", agent="scout"):
    return RequestContext(agent=agent, method=method, host=host, path=path)


def policy(*rules):
    return Policy(load_rules(list(rules)))


def test_first_match_wins():
    p = policy(
        {"decision": "deny", "hosts": "evil.com"},
        {"decision": "allow"},
    )
    assert p.evaluate(ctx(host="evil.com")).decision is Decision.DENY
    assert p.evaluate(ctx(host="good.com")).decision is Decision.ALLOW


def test_host_globs_and_case_normalization():
    p = policy({"decision": "allow", "hosts": ["*.Wikipedia.org"], "methods": ["get"]})
    assert p.evaluate(ctx(host="en.wikipedia.org")).rule == 0
    assert p.evaluate(ctx(host="wikipedia.org")).rule is None  # *.x does not match bare x


def test_path_glob_crosses_slashes():
    p = policy({"decision": "ask", "paths": "/gmail/v1/users/*/messages/send"})
    assert p.evaluate(ctx(method="POST", path="/gmail/v1/users/me/messages/send")).decision is Decision.ASK


def test_rules_can_be_scoped_to_agents():
    p = policy({"decision": "allow", "agents": "scout"})
    assert p.evaluate(ctx(agent="scout")).rule == 0
    assert p.evaluate(ctx(agent="intruder")).rule is None


def test_reason_defaults_to_rule_index():
    assert policy({"decision": "allow"}).evaluate(ctx()).reason == "rule 0"


def test_invalid_decision_rejected():
    with pytest.raises(ValueError, match="rule 0"):
        load_rules([{"decision": "maybe"}])


def test_unmatched_falls_back_to_decide_unmatched():
    verdict = policy().evaluate(ctx(method="POST"))
    assert verdict.rule is None and verdict.decision is Decision.ASK


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
def test_unmatched_small_reads_allowed(method):
    assert decide_unmatched(ctx(method=method)) is Decision.ALLOW


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_unmatched_writes_ask(method):
    assert decide_unmatched(ctx(method=method)) is Decision.ASK


def test_unmatched_read_with_body_asks():
    assert decide_unmatched(RequestContext("scout", "GET", "x.com", "/", body_size=1)) is Decision.ASK


def test_unmatched_long_query_asks():
    ok = RequestContext("scout", "GET", "x.com", "/", query_size=MAX_UNREVIEWED_QUERY)
    leaky = RequestContext("scout", "GET", "x.com", "/", query_size=MAX_UNREVIEWED_QUERY + 1)
    assert decide_unmatched(ok) is Decision.ALLOW
    assert decide_unmatched(leaky) is Decision.ASK

