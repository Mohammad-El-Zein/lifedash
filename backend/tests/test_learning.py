def _goal(client, headers, **overrides):
    payload = {
        "title": "Learn Rust",
        "description": "Work through the book",
        "target_date": "2026-12-31",
        "milestones": [
            {"title": "Read chapters 1-5", "due_date": "2026-08-01"},
            {"title": "Build a CLI tool", "due_date": None},
        ],
    }
    payload.update(overrides)
    res = client.post("/api/learning/goals", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _other_user_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "supersecret1", "full_name": "Other"},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_goal_crud_with_initial_milestones(client, auth_headers):
    goal = _goal(client, auth_headers)
    assert goal["status"] == "active"
    assert [m["position"] for m in goal["milestones"]] == [0, 1]
    assert all(m["done"] is False for m in goal["milestones"])

    res = client.put(
        f"/api/learning/goals/{goal['id']}",
        headers=auth_headers,
        json={"title": "Learn Rust properly", "description": None, "target_date": None},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Learn Rust properly"
    # milestones untouched by goal edits
    assert len(body["milestones"]) == 2

    res = client.delete(f"/api/learning/goals/{goal['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/api/learning/goals", headers=auth_headers).json() == []


def test_status_change_and_list_order(client, auth_headers):
    first = _goal(client, auth_headers, title="A", milestones=[])
    second = _goal(client, auth_headers, title="B", milestones=[])
    _goal(client, auth_headers, title="C", milestones=[])

    res = client.post(
        f"/api/learning/goals/{second['id']}/status",
        headers=auth_headers,
        json={"status": "done"},
    )
    assert res.status_code == 200
    res = client.post(
        f"/api/learning/goals/{first['id']}/status",
        headers=auth_headers,
        json={"status": "paused"},
    )
    assert res.status_code == 200

    titles = [g["title"] for g in client.get("/api/learning/goals", headers=auth_headers).json()]
    assert titles == ["C", "A", "B"]  # active, paused, done


def test_invalid_status_rejected(client, auth_headers):
    goal = _goal(client, auth_headers, milestones=[])
    res = client.post(
        f"/api/learning/goals/{goal['id']}/status",
        headers=auth_headers,
        json={"status": "abandoned"},
    )
    assert res.status_code == 422


def test_milestone_add_toggle_update_delete(client, auth_headers):
    goal = _goal(client, auth_headers)
    res = client.post(
        f"/api/learning/goals/{goal['id']}/milestones",
        headers=auth_headers,
        json={"title": "Write a blog post", "due_date": None},
    )
    assert res.status_code == 201
    milestone = res.json()
    assert milestone["position"] == 2  # appended after the initial two

    res = client.post(
        f"/api/learning/milestones/{milestone['id']}/toggle", headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["done"] is True
    res = client.post(
        f"/api/learning/milestones/{milestone['id']}/toggle", headers=auth_headers
    )
    assert res.json()["done"] is False

    res = client.put(
        f"/api/learning/milestones/{milestone['id']}",
        headers=auth_headers,
        json={"title": "Write two blog posts", "due_date": "2026-09-01", "done": True},
    )
    assert res.status_code == 200
    assert res.json() == {
        "id": milestone["id"],
        "title": "Write two blog posts",
        "done": True,
        "due_date": "2026-09-01",
        "position": 2,
    }

    res = client.delete(f"/api/learning/milestones/{milestone['id']}", headers=auth_headers)
    assert res.status_code == 204
    goals = client.get("/api/learning/goals", headers=auth_headers).json()
    assert len(goals[0]["milestones"]) == 2


def test_tenancy(client, auth_headers):
    goal = _goal(client, auth_headers)
    milestone_id = goal["milestones"][0]["id"]
    other = _other_user_headers(client)
    assert client.get("/api/learning/goals", headers=other).json() == []
    assert (
        client.delete(f"/api/learning/goals/{goal['id']}", headers=other).status_code == 404
    )
    assert (
        client.post(f"/api/learning/milestones/{milestone_id}/toggle", headers=other).status_code
        == 404
    )


def test_requires_auth(client):
    assert client.get("/api/learning/goals").status_code == 401
