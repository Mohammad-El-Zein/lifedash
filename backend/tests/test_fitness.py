def _exercise(client, headers, name="Bench Press", **overrides):
    payload = {"name": name, "muscle_group": "Chest"}
    payload.update(overrides)
    res = client.post("/api/fitness/exercises", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _workout(client, headers, **overrides):
    payload = {"date": "2026-07-01", "name": "Push Day", "notes": None, "sets": []}
    payload.update(overrides)
    res = client.post("/api/fitness/workouts", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _other_user_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "supersecret1", "full_name": "Other"},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_exercise_crud(client, auth_headers):
    ex = _exercise(client, auth_headers)
    assert ex["name"] == "Bench Press"
    assert ex["muscle_group"] == "Chest"

    res = client.put(
        f"/api/fitness/exercises/{ex['id']}",
        headers=auth_headers,
        json={"name": "Incline Bench", "muscle_group": None},
    )
    assert res.status_code == 200
    assert res.json() == {"id": ex["id"], "name": "Incline Bench", "muscle_group": None}

    res = client.delete(f"/api/fitness/exercises/{ex['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/api/fitness/exercises", headers=auth_headers).json() == []


def test_exercise_duplicate_name_conflicts(client, auth_headers):
    _exercise(client, auth_headers, name="Squat")
    res = client.post(
        "/api/fitness/exercises", headers=auth_headers, json={"name": "Squat"}
    )
    assert res.status_code == 409


def test_exercise_list_sorted_by_name(client, auth_headers):
    _exercise(client, auth_headers, name="Squat")
    _exercise(client, auth_headers, name="Bench Press")
    names = [e["name"] for e in client.get("/api/fitness/exercises", headers=auth_headers).json()]
    assert names == ["Bench Press", "Squat"]


def test_exercise_in_use_cannot_be_deleted(client, auth_headers):
    ex = _exercise(client, auth_headers)
    _workout(
        client,
        auth_headers,
        sets=[{"exercise_id": ex["id"], "reps": 8, "weight_kg": "60.00"}],
    )
    res = client.delete(f"/api/fitness/exercises/{ex['id']}", headers=auth_headers)
    assert res.status_code == 409


def test_workout_create_assigns_set_numbers_in_order(client, auth_headers):
    bench = _exercise(client, auth_headers, name="Bench Press")
    squat = _exercise(client, auth_headers, name="Squat")
    workout = _workout(
        client,
        auth_headers,
        sets=[
            {"exercise_id": bench["id"], "reps": 10, "weight_kg": "50"},
            {"exercise_id": bench["id"], "reps": 8, "weight_kg": "55"},
            {"exercise_id": squat["id"], "reps": 5, "weight_kg": "80"},
        ],
    )
    assert [s["set_number"] for s in workout["sets"]] == [1, 2, 3]
    assert [s["exercise_id"] for s in workout["sets"]] == [bench["id"], bench["id"], squat["id"]]


def test_workout_update_replaces_sets(client, auth_headers):
    bench = _exercise(client, auth_headers)
    workout = _workout(
        client,
        auth_headers,
        sets=[{"exercise_id": bench["id"], "reps": 10, "weight_kg": "50"}],
    )
    res = client.put(
        f"/api/fitness/workouts/{workout['id']}",
        headers=auth_headers,
        json={
            "date": "2026-07-02",
            "name": "Push Day 2",
            "notes": "felt strong",
            "sets": [
                {"exercise_id": bench["id"], "reps": 6, "weight_kg": "60"},
                {"exercise_id": bench["id"], "reps": 6, "weight_kg": "60"},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Push Day 2"
    assert body["date"] == "2026-07-02"
    assert len(body["sets"]) == 2
    assert [s["set_number"] for s in body["sets"]] == [1, 2]


def test_workout_delete_and_list_order(client, auth_headers):
    first = _workout(client, auth_headers, date="2026-07-01", name="A")
    second = _workout(client, auth_headers, date="2026-07-03", name="B")
    names = [w["name"] for w in client.get("/api/fitness/workouts", headers=auth_headers).json()]
    assert names == ["B", "A"]

    res = client.delete(f"/api/fitness/workouts/{second['id']}", headers=auth_headers)
    assert res.status_code == 204
    remaining = client.get("/api/fitness/workouts", headers=auth_headers).json()
    assert [w["id"] for w in remaining] == [first["id"]]


def test_workout_rejects_foreign_exercise(client, auth_headers):
    other = _other_user_headers(client)
    foreign = _exercise(client, other, name="Deadlift")
    res = client.post(
        "/api/fitness/workouts",
        headers=auth_headers,
        json={
            "date": "2026-07-01",
            "name": "Pull Day",
            "notes": None,
            "sets": [{"exercise_id": foreign["id"], "reps": 5, "weight_kg": "100"}],
        },
    )
    assert res.status_code == 404


def test_workout_tenancy(client, auth_headers):
    workout = _workout(client, auth_headers)
    other = _other_user_headers(client)
    assert client.get(f"/api/fitness/workouts/{workout['id']}", headers=other).status_code == 404
    assert client.get("/api/fitness/workouts", headers=other).json() == []


def test_progress_top_weight_per_workout(client, auth_headers):
    bench = _exercise(client, auth_headers)
    _workout(
        client,
        auth_headers,
        date="2026-06-01",
        sets=[
            {"exercise_id": bench["id"], "reps": 10, "weight_kg": "50"},
            {"exercise_id": bench["id"], "reps": 8, "weight_kg": "55"},
        ],
    )
    _workout(
        client,
        auth_headers,
        date="2026-06-08",
        sets=[
            {"exercise_id": bench["id"], "reps": 8, "weight_kg": "57.5"},
            {"exercise_id": bench["id"], "reps": 12, "weight_kg": "40"},
            # bodyweight set: no weight, must not produce a point
            {"exercise_id": bench["id"], "reps": 15, "weight_kg": None},
        ],
    )
    res = client.get(f"/api/fitness/exercises/{bench['id']}/progress", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Bench Press"
    assert [(p["date"], p["top_weight"], p["reps_at_top"]) for p in body["points"]] == [
        ("2026-06-01", "55.00", 8),
        ("2026-06-08", "57.50", 8),
    ]


def test_progress_requires_owned_exercise(client, auth_headers):
    other = _other_user_headers(client)
    foreign = _exercise(client, other, name="Deadlift")
    res = client.get(f"/api/fitness/exercises/{foreign['id']}/progress", headers=auth_headers)
    assert res.status_code == 404


def test_requires_auth(client):
    assert client.get("/api/fitness/workouts").status_code == 401
    assert client.get("/api/fitness/exercises").status_code == 401
