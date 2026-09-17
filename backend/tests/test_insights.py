import datetime

import pytest
from fastapi import HTTPException

from app.main import app
from app.schemas.insights import AiInsights
from app.services.ai import get_ai_service
from app.services.insights import build_snapshot, has_enough_data, monday_of

TODAY = datetime.date.today()


class FakeAi:
    """Counts calls, so the cost-shaping behaviour is what the tests assert on."""

    def __init__(self, answer: AiInsights | None = None, configured: bool = True):
        self.answer = answer
        self.error: Exception | None = None
        self._configured = configured
        self.calls: list[dict] = []

    @property
    def configured(self) -> bool:
        return self._configured

    def parse(self, *, system, prompt, schema, max_tokens=1024):
        self.calls.append({"system": system, "prompt": prompt})
        if self.error is not None:
            raise self.error
        return self.answer


def answer(*insights) -> AiInsights:
    return AiInsights.model_validate({"insights": list(insights)})


INSIGHT = {
    "title": "Essen kostet mehr, Kochen weniger",
    "body": "Diese Woche 3 Mahlzeiten geloggt, aber 120 € in der Kategorie Essen ausgegeben.",
    "modules": ["finance", "meals"],
    "tone": "warning",
}


@pytest.fixture()
def fake_ai():
    fake = FakeAi(answer=answer(INSIGHT))
    app.dependency_overrides[get_ai_service] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_ai_service, None)


def seed(client, headers) -> None:
    """Enough activity in two modules that insights are worth generating."""
    client.post(
        "/api/finance/transactions",
        headers=headers,
        json={
            "kind": "expense",
            "amount": "120.00",
            "description": "Restaurant",
            "date": TODAY.isoformat(),
            "category_id": None,
        },
    )
    client.post(
        "/api/meals",
        headers=headers,
        json={
            "date": TODAY.isoformat(),
            "meal_type": "lunch",
            "name": "Pasta",
            "calories": 600,
            "protein_g": 20,
            "carbs_g": None,
            "fat_g": None,
        },
    )


def test_generates_on_the_first_visit_of_the_day(client, auth_headers, fake_ai):
    seed(client, auth_headers)

    res = client.get("/api/insights", headers=auth_headers)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["available"] is True
    assert body["insights"][0]["title"] == INSIGHT["title"]
    assert body["insights"][0]["modules"] == ["finance", "meals"]
    assert len(fake_ai.calls) == 1


def test_later_visits_the_same_day_are_served_from_the_cache(client, auth_headers, fake_ai):
    seed(client, auth_headers)

    first = client.get("/api/insights", headers=auth_headers).json()
    for _ in range(4):
        again = client.get("/api/insights", headers=auth_headers).json()

    # One API call for five dashboard visits.
    assert len(fake_ai.calls) == 1
    assert again["insights"] == first["insights"]
    assert again["generated_at"] == first["generated_at"]


def test_refresh_regenerates_and_is_capped(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    client.get("/api/insights", headers=auth_headers)

    fake_ai.answer = answer({**INSIGHT, "title": "Neu berechnet"})
    refreshed = client.post("/api/insights/refresh", headers=auth_headers)

    assert refreshed.status_code == 200
    assert refreshed.json()["insights"][0]["title"] == "Neu berechnet"
    assert len(fake_ai.calls) == 2

    for _ in range(4):
        assert client.post("/api/insights/refresh", headers=auth_headers).status_code == 200
    assert client.post("/api/insights/refresh", headers=auth_headers).status_code == 429


def test_a_language_switch_invalidates_the_cache(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    client.get("/api/insights", headers=auth_headers)
    assert fake_ai.calls[0]["system"].count("English") >= 1

    assert (
        client.patch("/api/users/me", headers=auth_headers, json={"language": "de"}).status_code
        == 200
    )
    body = client.get("/api/insights", headers=auth_headers).json()

    assert len(fake_ai.calls) == 2  # regenerated for the new language
    assert "German" in fake_ai.calls[1]["system"]
    assert body["language"] == "de"


def test_an_empty_account_costs_nothing(client, auth_headers, fake_ai):
    res = client.get("/api/insights", headers=auth_headers)

    assert res.status_code == 200
    assert res.json()["insights"] == []
    assert fake_ai.calls == []  # nothing to connect, so no API call


def test_reports_unavailable_without_a_key(client, auth_headers):
    unconfigured = FakeAi(configured=False)
    app.dependency_overrides[get_ai_service] = lambda: unconfigured
    try:
        body = client.get("/api/insights", headers=auth_headers).json()
    finally:
        app.dependency_overrides.pop(get_ai_service, None)

    assert body == {"available": False, "insights": [], "generated_at": None, "language": None}
    assert unconfigured.calls == []


def test_unknown_module_keys_are_dropped(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    fake_ai.answer = answer({**INSIGHT, "modules": ["finance", "astrology"]})

    body = client.get("/api/insights", headers=auth_headers).json()

    assert body["insights"][0]["modules"] == ["finance"]


def test_at_most_four_insights_are_kept(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    fake_ai.answer = answer(*[{**INSIGHT, "title": f"Nr {i}"} for i in range(9)])

    body = client.get("/api/insights", headers=auth_headers).json()

    assert len(body["insights"]) == 4


def test_insights_are_per_user(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    client.get("/api/insights", headers=auth_headers)

    other = client.post(
        "/api/auth/register", json={"email": "other@example.com", "password": "password123"}
    )
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    body = client.get("/api/insights", headers=other_headers).json()

    assert body["insights"] == []  # the other account has no data of its own
    assert len(fake_ai.calls) == 1


def test_a_failed_regeneration_keeps_serving_the_cached_set(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    first = client.get("/api/insights", headers=auth_headers).json()

    # Force the next generation attempt to fail, as an Anthropic outage would.
    fake_ai.error = HTTPException(502, "The AI service is currently unavailable")
    stale = client.post("/api/insights/refresh", headers=auth_headers)

    assert stale.status_code == 502  # an explicit refresh reports the failure

    body = client.get("/api/insights", headers=auth_headers).json()
    assert body["insights"] == first["insights"]  # the dashboard keeps working


def test_a_first_generation_failure_is_reported(client, auth_headers, fake_ai):
    seed(client, auth_headers)
    fake_ai.error = HTTPException(502, "The AI service is currently unavailable")

    # Nothing cached yet, so there is nothing to fall back to.
    assert client.get("/api/insights", headers=auth_headers).status_code == 502


def test_requires_authentication(client):
    assert client.get("/api/insights").status_code == 401
    assert client.post("/api/insights/refresh").status_code == 401


# --- snapshot -----------------------------------------------------------------------


def test_snapshot_only_contains_the_users_own_aggregates(client, auth_headers, db_session):
    seed(client, auth_headers)
    user_id = 1

    snapshot = build_snapshot(db_session, user_id, TODAY)

    assert snapshot["week_start"] == monday_of(TODAY).isoformat()
    assert snapshot["finance"]["expenses_so_far"] == 120.0
    assert snapshot["meals"]["meals_this_week"] == 1
    assert has_enough_data(snapshot) is True
    # No raw rows, only aggregates.
    assert "transactions" not in snapshot["finance"]


def test_empty_snapshot_is_not_worth_a_call(db_session):
    snapshot = build_snapshot(db_session, 999, TODAY)

    assert has_enough_data(snapshot) is False
