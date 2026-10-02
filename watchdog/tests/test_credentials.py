import pytest

from watchdog_proxy.credentials import inject, load_credentials
from watchdog_proxy.policy import RequestContext

CREDS = load_credentials([
    {"hosts": "api.anthropic.com", "header": "x-api-key", "env": "ANTHROPIC_API_KEY"},
    {"hosts": ["*.github.com"], "header": "Authorization", "env": "GH_TOKEN", "agents": ["researcher"]},
])


def ctx(host, agent="researcher"):
    return RequestContext(agent=agent, method="POST", host=host, path="/")


def test_placeholder_replaced_with_real_secret():
    headers = {"x-api-key": "injected-by-watchdog"}
    assert inject(headers, ctx("api.anthropic.com"), CREDS, {"ANTHROPIC_API_KEY": "sk-real"}) is None
    assert headers["x-api-key"] == "sk-real"


def test_secret_never_sent_to_other_hosts():
    headers = {"x-api-key": "injected-by-watchdog"}
    inject(headers, ctx("evil.example"), CREDS, {"ANTHROPIC_API_KEY": "sk-real"})
    assert headers["x-api-key"] == "injected-by-watchdog"


def test_credentials_can_be_scoped_to_agents():
    headers = {}
    inject(headers, ctx("api.github.com", agent="scout"), CREDS, {"GH_TOKEN": "ghp"})
    assert "Authorization" not in headers


def test_missing_secret_fails_closed():
    reason = inject({}, ctx("api.anthropic.com"), CREDS, {})
    assert reason and "ANTHROPIC_API_KEY" in reason


def test_bad_config_names_the_entry():
    with pytest.raises(ValueError, match="credential 0"):
        load_credentials([{"hosts": "x"}])
