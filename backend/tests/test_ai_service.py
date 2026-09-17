import pytest
from fastapi import HTTPException

from app.schemas.capture import AiCaptureSuggestion
from app.services.ai import AnthropicAiClient


def _client(api_key: str) -> AnthropicAiClient:
    return AnthropicAiClient(api_key=api_key, model="claude-haiku-4-5", timeout=5.0)


def test_reports_itself_unconfigured_without_a_key():
    assert _client("").configured is False
    assert _client("sk-ant-test").configured is True


def test_refuses_to_call_without_a_key():
    """No key must mean a clean 503 — never an attempted call with an empty key."""
    with pytest.raises(HTTPException) as exc:
        _client("").parse(system="s", prompt="p", schema=AiCaptureSuggestion)

    assert exc.value.status_code == 503
