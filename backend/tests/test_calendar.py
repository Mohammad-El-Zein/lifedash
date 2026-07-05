RECURRING = {
    "title": "Work at Wilo",
    "location": "Dortmund",
    "start_date": "2026-01-05",
    "end_date": None,
    "start_time": "09:00",
    "end_time": "17:00",
    "recurrence_days": [0, 3, 4],  # Mon, Thu, Fri
}

ONE_OFF = {
    "title": "Dentist",
    "start_date": "2026-07-08",
    "start_time": "10:00",
    "end_time": "11:00",
    "recurrence_days": None,
}


def _create(client, headers, payload):
    res = client.post("/api/calendar/events", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_event_crud(client, auth_headers):
    event = _create(client, auth_headers, RECURRING)
    event_id = event["id"]
    assert event["recurrence_days"] == [0, 3, 4]

    res = client.get(f"/api/calendar/events/{event_id}", headers=auth_headers)
    assert res.status_code == 200

    updated = {**RECURRING, "title": "Work (updated)"}
    res = client.put(f"/api/calendar/events/{event_id}", headers=auth_headers, json=updated)
    assert res.status_code == 200
    assert res.json()["title"] == "Work (updated)"

    res = client.delete(f"/api/calendar/events/{event_id}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get(f"/api/calendar/events/{event_id}", headers=auth_headers).status_code == 404


def test_validation_rejects_bad_times(client, auth_headers):
    bad = {**ONE_OFF, "start_time": "12:00", "end_time": "11:00"}
    res = client.post("/api/calendar/events", headers=auth_headers, json=bad)
    assert res.status_code == 422

    bad = {**RECURRING, "recurrence_days": [7]}
    res = client.post("/api/calendar/events", headers=auth_headers, json=bad)
    assert res.status_code == 422


def test_week_expansion(client, auth_headers):
    _create(client, auth_headers, RECURRING)
    _create(client, auth_headers, ONE_OFF)

    # Week of Mon 2026-07-06 .. Sun 2026-07-12
    res = client.get("/api/calendar/week", headers=auth_headers, params={"start": "2026-07-06"})
    assert res.status_code == 200
    body = res.json()
    assert body["week_start"] == "2026-07-06"
    dates = [(o["title"], o["date"]) for o in body["occurrences"]]
    assert ("Work at Wilo", "2026-07-06") in dates  # Monday
    assert ("Work at Wilo", "2026-07-09") in dates  # Thursday
    assert ("Work at Wilo", "2026-07-10") in dates  # Friday
    assert ("Dentist", "2026-07-08") in dates
    assert len(dates) == 4


def test_week_normalises_to_monday(client, auth_headers):
    _create(client, auth_headers, RECURRING)
    res = client.get("/api/calendar/week", headers=auth_headers, params={"start": "2026-07-09"})
    assert res.json()["week_start"] == "2026-07-06"


def test_cancelled_exception(client, auth_headers):
    event = _create(client, auth_headers, RECURRING)
    res = client.post(
        f"/api/calendar/events/{event['id']}/exceptions",
        headers=auth_headers,
        json={"original_date": "2026-07-06", "kind": "cancelled"},
    )
    assert res.status_code == 201

    res = client.get("/api/calendar/week", headers=auth_headers, params={"start": "2026-07-06"})
    dates = [o["date"] for o in res.json()["occurrences"]]
    assert "2026-07-06" not in dates
    assert "2026-07-09" in dates


def test_moved_exception(client, auth_headers):
    event = _create(client, auth_headers, RECURRING)
    res = client.post(
        f"/api/calendar/events/{event['id']}/exceptions",
        headers=auth_headers,
        json={
            "original_date": "2026-07-06",
            "kind": "moved",
            "new_date": "2026-07-07",
            "new_start_time": "10:00",
            "new_end_time": "18:00",
        },
    )
    assert res.status_code == 201

    res = client.get("/api/calendar/week", headers=auth_headers, params={"start": "2026-07-06"})
    occ = {o["date"]: o for o in res.json()["occurrences"]}
    assert "2026-07-06" not in occ
    moved = occ["2026-07-07"]
    assert moved["is_moved"] is True
    assert moved["start_time"] == "10:00:00"


def test_moved_exception_requires_new_date(client, auth_headers):
    event = _create(client, auth_headers, RECURRING)
    res = client.post(
        f"/api/calendar/events/{event['id']}/exceptions",
        headers=auth_headers,
        json={"original_date": "2026-07-06", "kind": "moved"},
    )
    assert res.status_code == 422


def test_user_isolation(client, auth_headers):
    event = _create(client, auth_headers, ONE_OFF)

    res = client.post(
        "/api/auth/register", json={"email": "other@example.com", "password": "password123"}
    )
    other_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    assert (
        client.get(f"/api/calendar/events/{event['id']}", headers=other_headers).status_code == 404
    )
    res = client.get("/api/calendar/events", headers=other_headers)
    assert res.json() == []
