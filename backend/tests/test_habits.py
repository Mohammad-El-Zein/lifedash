from datetime import date, timedelta

TODAY = date.today()


def _habit(client, headers, name="Meditation", **overrides):
    payload = {"name": name, "schedule_days": None}
    payload.update(overrides)
    res = client.post("/api/habits", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _toggle(client, headers, habit_id, day):
    res = client.post(
        f"/api/habits/{habit_id}/toggle", headers=headers, json={"date": day.isoformat()}
    )
    assert res.status_code == 200, res.text
    return res.json()


def _other_user_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "supersecret1", "full_name": "Other"},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_habit_crud(client, auth_headers):
    habit = _habit(client, auth_headers)
    assert habit["schedule_days"] is None
    assert habit["streak"] == 0
    assert habit["is_archived"] is False

    res = client.put(
        f"/api/habits/{habit['id']}",
        headers=auth_headers,
        json={"name": "Morning meditation", "schedule_days": [0, 2, 4], "is_archived": False},
    )
    assert res.status_code == 200
    assert res.json()["schedule_days"] == [0, 2, 4]

    res = client.delete(f"/api/habits/{habit['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/api/habits", headers=auth_headers).json() == []


def test_schedule_normalization(client, auth_headers):
    habit = _habit(client, auth_headers, schedule_days=[6, 0, 0, 6])
    assert habit["schedule_days"] == [0, 6]
    # all seven days normalizes to daily (null)
    habit = _habit(client, auth_headers, name="Daily", schedule_days=[0, 1, 2, 3, 4, 5, 6])
    assert habit["schedule_days"] is None

    res = client.post(
        "/api/habits", headers=auth_headers, json={"name": "X", "schedule_days": [7]}
    )
    assert res.status_code == 422
    res = client.post(
        "/api/habits", headers=auth_headers, json={"name": "X", "schedule_days": []}
    )
    assert res.status_code == 422


def test_toggle_creates_and_removes_log(client, auth_headers):
    habit = _habit(client, auth_headers)
    assert _toggle(client, auth_headers, habit["id"], TODAY) == {
        "date": TODAY.isoformat(),
        "done": True,
    }
    habits = client.get("/api/habits", headers=auth_headers).json()
    assert habits[0]["week_logs"] == {TODAY.isoformat(): True}

    assert _toggle(client, auth_headers, habit["id"], TODAY)["done"] is False
    habits = client.get("/api/habits", headers=auth_headers).json()
    assert habits[0]["week_logs"] == {}


def test_streak_counts_consecutive_days(client, auth_headers):
    habit = _habit(client, auth_headers)
    for offset in (1, 2, 3):
        _toggle(client, auth_headers, habit["id"], TODAY - timedelta(days=offset))
    habits = client.get("/api/habits", headers=auth_headers).json()
    # today unlogged doesn't break the streak, it's just not counted yet
    assert habits[0]["streak"] == 3

    _toggle(client, auth_headers, habit["id"], TODAY)
    habits = client.get("/api/habits", headers=auth_headers).json()
    assert habits[0]["streak"] == 4


def test_streak_gap_resets(client, auth_headers):
    habit = _habit(client, auth_headers)
    _toggle(client, auth_headers, habit["id"], TODAY)
    _toggle(client, auth_headers, habit["id"], TODAY - timedelta(days=2))
    habits = client.get("/api/habits", headers=auth_headers).json()
    assert habits[0]["streak"] == 1  # yesterday missing → only today counts


def test_streak_skips_unscheduled_days(client, auth_headers):
    # scheduled only on today's weekday and the day before yesterday's weekday
    wd = TODAY.weekday()
    days = sorted({wd, (wd - 2) % 7})
    habit = _habit(client, auth_headers, schedule_days=days)
    _toggle(client, auth_headers, habit["id"], TODAY)
    _toggle(client, auth_headers, habit["id"], TODAY - timedelta(days=2))
    habits = client.get("/api/habits", headers=auth_headers).json()
    # yesterday is not scheduled, so it doesn't break the chain
    assert habits[0]["streak"] == 2


def test_week_logs_filtered_by_requested_week(client, auth_headers):
    habit = _habit(client, auth_headers)
    last_week_day = TODAY - timedelta(days=7)
    _toggle(client, auth_headers, habit["id"], last_week_day)
    _toggle(client, auth_headers, habit["id"], TODAY)

    this_week = client.get("/api/habits", headers=auth_headers).json()
    assert TODAY.isoformat() in this_week[0]["week_logs"]
    assert last_week_day.isoformat() not in this_week[0]["week_logs"]

    prev_week = client.get(
        f"/api/habits?week={last_week_day.isoformat()}", headers=auth_headers
    ).json()
    assert last_week_day.isoformat() in prev_week[0]["week_logs"]
    assert TODAY.isoformat() not in prev_week[0]["week_logs"]


def test_archived_hidden_by_default(client, auth_headers):
    habit = _habit(client, auth_headers)
    res = client.put(
        f"/api/habits/{habit['id']}",
        headers=auth_headers,
        json={"name": habit["name"], "schedule_days": None, "is_archived": True},
    )
    assert res.status_code == 200
    assert client.get("/api/habits", headers=auth_headers).json() == []
    everything = client.get("/api/habits?include_archived=true", headers=auth_headers).json()
    assert len(everything) == 1
    assert everything[0]["is_archived"] is True


def test_tenancy(client, auth_headers):
    habit = _habit(client, auth_headers)
    other = _other_user_headers(client)
    assert client.get("/api/habits", headers=other).json() == []
    res = client.post(
        f"/api/habits/{habit['id']}/toggle", headers=other, json={"date": TODAY.isoformat()}
    )
    assert res.status_code == 404


def test_requires_auth(client):
    assert client.get("/api/habits").status_code == 401


def test_toggle_duplicate_insert_hits_unique_constraint(client, auth_headers, db_session):
    """The (habit_id, date) unique constraint is what commit_or_409 in the
    toggle endpoint relies on to turn a concurrent double-toggle into a 409
    instead of a 500 — assert it actually exists."""
    from sqlalchemy.exc import IntegrityError

    from app.models.habits import HabitLog

    habit = _habit(client, auth_headers)
    assert _toggle(client, auth_headers, habit["id"], TODAY)["done"] is True

    db_session.add(HabitLog(user_id=1, habit_id=habit["id"], date=TODAY, done=True))
    try:
        db_session.commit()
        raise AssertionError("duplicate (habit_id, date) insert must be rejected")
    except IntegrityError:
        db_session.rollback()


def test_streak_longer_than_first_window_still_counts(client, auth_headers):
    """Streaks spanning the bounded first-pass window trigger the full-depth
    second pass instead of being cut off at the window edge."""
    from app.routers import habits as habits_router

    habit = _habit(client, auth_headers)
    days = habits_router.STREAK_WINDOW_DAYS + 5
    for offset in range(days):
        _toggle(client, auth_headers, habit["id"], TODAY - timedelta(days=offset))
    result = client.get("/api/habits", headers=auth_headers).json()
    assert result[0]["streak"] == days
