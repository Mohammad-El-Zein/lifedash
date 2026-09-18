import datetime

import pytest
from fastapi import HTTPException

from app.main import app
from app.schemas.capture import AiCaptureSuggestion
from app.services.ai import get_ai_service

TODAY = datetime.date.today().isoformat()


class FakeAi:
    """Stands in for Anthropic: records the prompt and replays a canned answer."""

    def __init__(self, answer=None, error: Exception | None = None):
        self.answer = answer
        self.error = error
        self.calls: list[dict] = []

    @property
    def configured(self) -> bool:
        return True

    def parse(self, *, system, prompt, schema, max_tokens=1024):
        self.calls.append({"system": system, "prompt": prompt, "max_tokens": max_tokens})
        if self.error is not None:
            raise self.error
        return self.answer


def suggestion(**overrides) -> AiCaptureSuggestion:
    payload = {
        "module": "unknown",
        "confidence": "low",
        "summary": "Not sure what to do with that.",
        "finance": None,
        "meal": None,
        "event": None,
        "job": None,
    }
    payload.update(overrides)
    return AiCaptureSuggestion.model_validate(payload)


@pytest.fixture()
def fake_ai():
    fake = FakeAi()
    app.dependency_overrides[get_ai_service] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_ai_service, None)


def _parse(client, headers, text="50 Euro für Essen ausgegeben heute"):
    return client.post("/api/capture/parse", headers=headers, json={"text": text})


def test_parses_a_spend_into_a_finance_suggestion(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(
        module="finance",
        confidence="high",
        summary="50 € Ausgabe für Essen wird gespeichert.",
        finance={
            "kind": "expense",
            "amount": 50,
            "description": "Essen",
            "date": TODAY,
            "category": "Essen",
        },
    )

    res = _parse(client, auth_headers)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["module"] == "finance"
    assert body["finance"]["amount"] == 50
    assert body["finance"]["kind"] == "expense"
    assert body["finance"]["date"] == TODAY
    assert body["meal"] is None


def test_resolves_the_category_the_user_already_has(client, auth_headers, fake_ai):
    created = client.post(
        "/api/finance/categories",
        headers=auth_headers,
        json={"name": "Essen", "kind": "expense", "color": "#10b981"},
    )
    assert created.status_code == 201, created.text
    category_id = created.json()["id"]

    fake_ai.answer = suggestion(
        module="finance",
        confidence="high",
        summary="ok",
        finance={
            "kind": "expense",
            "amount": 12.5,
            "description": "Döner",
            "date": TODAY,
            # Different casing than the stored category on purpose.
            "category": "essen",
        },
    )

    body = _parse(client, auth_headers).json()

    assert body["finance"]["category_id"] == category_id
    # The user's own categories are given to the model so it can reuse them.
    assert "Essen" in fake_ai.calls[0]["system"]


def test_unknown_category_comes_back_unresolved(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(
        module="finance",
        confidence="medium",
        summary="ok",
        finance={
            "kind": "expense",
            "amount": 9,
            "description": "Kino",
            "date": TODAY,
            "category": "Freizeit",
        },
    )

    body = _parse(client, auth_headers).json()

    assert body["finance"]["category_id"] is None
    assert body["finance"]["category"] == "Freizeit"


def test_clamps_values_the_model_got_wrong(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(
        module="meals",
        confidence="low",
        summary="ok",
        meal={
            "name": "Müsli",
            "meal_type": "breakfast",
            "calories": 999_999,
            "protein_g": -5,
            "carbs_g": None,
            "fat_g": None,
            "date": "not-a-date",
        },
    )

    body = _parse(client, auth_headers).json()

    assert body["meal"]["calories"] == 10000  # MAX_MEAL_CALORIES
    assert body["meal"]["protein_g"] == 0
    assert body["meal"]["date"] == TODAY  # unparsable date falls back to today


def test_negative_amount_is_taken_as_positive(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(
        module="finance",
        confidence="high",
        summary="ok",
        finance={
            "kind": "expense",
            "amount": -50,
            "description": "Essen",
            "date": TODAY,
            "category": None,
        },
    )

    assert _parse(client, auth_headers).json()["finance"]["amount"] == 50


def test_event_without_a_usable_end_time_gets_one(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(
        module="calendar",
        confidence="medium",
        summary="ok",
        event={
            "title": "Zahnarzt",
            "date": TODAY,
            "start_time": "14:00",
            "end_time": "13:00",
            "location": None,
        },
    )

    event = _parse(client, auth_headers).json()["event"]

    assert event["start_time"] == "14:00:00"
    assert event["end_time"] == "15:00:00"


def test_a_module_without_its_block_degrades_to_unknown(client, auth_headers, fake_ai):
    # The model claimed "finance" but filled nothing in.
    fake_ai.answer = suggestion(module="finance", confidence="low", summary="Hm.")

    body = _parse(client, auth_headers).json()

    assert body["module"] == "unknown"
    assert body["finance"] is None


def test_unknown_note_returns_no_block(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(summary="Das passt in kein Modul.")

    body = _parse(client, auth_headers, text="Erinnere mich an den Sinn des Lebens").json()

    assert body["module"] == "unknown"
    assert body["summary"] == "Das passt in kein Modul."


def test_nothing_is_persisted(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(
        module="finance",
        confidence="high",
        summary="ok",
        finance={
            "kind": "expense",
            "amount": 50,
            "description": "Essen",
            "date": TODAY,
            "category": None,
        },
    )

    _parse(client, auth_headers)

    month = f"{TODAY[:8]}01"
    assert client.get(f"/api/finance/transactions?month={month}", headers=auth_headers).json() == []


def test_upstream_failure_is_passed_through(client, auth_headers, fake_ai):
    fake_ai.error = HTTPException(502, "The AI service is currently unavailable")

    res = _parse(client, auth_headers)

    assert res.status_code == 502


def test_empty_and_oversized_text_are_rejected(client, auth_headers, fake_ai):
    empty = client.post("/api/capture/parse", headers=auth_headers, json={"text": ""})
    assert empty.status_code == 422
    long_text = "a" * 501
    res = client.post("/api/capture/parse", headers=auth_headers, json={"text": long_text})
    assert res.status_code == 422
    assert fake_ai.calls == []  # no API call, so no cost


def test_rate_limited_per_user(client, auth_headers, fake_ai):
    fake_ai.answer = suggestion(summary="ok")

    for _ in range(30):
        assert _parse(client, auth_headers).status_code == 200
    assert _parse(client, auth_headers).status_code == 429


def test_requires_authentication(client):
    assert client.post("/api/capture/parse", json={"text": "hi"}).status_code == 401
