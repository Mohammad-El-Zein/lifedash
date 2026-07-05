def _application(client, headers, **overrides):
    payload = {
        "company": "Wilo SE",
        "position": "Junior Software Engineer",
        "link": "https://example.com/job",
        "applied_date": "2026-07-01",
        "notes": "Referral from Max",
    }
    payload.update(overrides)
    res = client.post("/api/jobs/applications", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_application_crud(client, auth_headers):
    app_ = _application(client, auth_headers)
    assert app_["status"] == "applied"
    assert len(app_["status_history"]) == 1
    assert app_["status_history"][0]["status"] == "applied"

    res = client.put(
        f"/api/jobs/applications/{app_['id']}",
        headers=auth_headers,
        json={
            "company": "Wilo SE",
            "position": "Software Engineer",
            "link": None,
            "applied_date": "2026-07-01",
            "notes": None,
        },
    )
    assert res.status_code == 200
    assert res.json()["position"] == "Software Engineer"

    res = client.delete(f"/api/jobs/applications/{app_['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/api/jobs/applications", headers=auth_headers).json() == []


def test_status_change_appends_history(client, auth_headers):
    app_ = _application(client, auth_headers)

    res = client.post(
        f"/api/jobs/applications/{app_['id']}/status",
        headers=auth_headers,
        json={"status": "interview", "note": "Phone screen on Friday"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "interview"
    assert [h["status"] for h in body["status_history"]] == ["applied", "interview"]
    assert body["status_history"][-1]["note"] == "Phone screen on Friday"

    # Same status again is rejected.
    res = client.post(
        f"/api/jobs/applications/{app_['id']}/status",
        headers=auth_headers,
        json={"status": "interview"},
    )
    assert res.status_code == 422

    # Invalid status is rejected by the schema.
    res = client.post(
        f"/api/jobs/applications/{app_['id']}/status",
        headers=auth_headers,
        json={"status": "ghosted"},
    )
    assert res.status_code == 422


def test_status_filter(client, auth_headers):
    a = _application(client, auth_headers, company="A")
    _application(client, auth_headers, company="B")
    client.post(
        f"/api/jobs/applications/{a['id']}/status",
        headers=auth_headers,
        json={"status": "interview"},
    )

    res = client.get(
        "/api/jobs/applications", headers=auth_headers, params={"status": "interview"}
    )
    assert [x["company"] for x in res.json()] == ["A"]

    res = client.get("/api/jobs/applications", headers=auth_headers, params={"status": "applied"})
    assert [x["company"] for x in res.json()] == ["B"]

    res = client.get("/api/jobs/applications", headers=auth_headers)
    assert len(res.json()) == 2


def test_jobs_user_isolation(client, auth_headers):
    app_ = _application(client, auth_headers)

    res = client.post(
        "/api/auth/register", json={"email": "other-jobs@example.com", "password": "password123"}
    )
    other = {"Authorization": f"Bearer {res.json()['access_token']}"}

    assert client.get("/api/jobs/applications", headers=other).json() == []
    assert (
        client.get(f"/api/jobs/applications/{app_['id']}", headers=other).status_code == 404
    )
    res = client.post(
        f"/api/jobs/applications/{app_['id']}/status",
        headers=other,
        json={"status": "offer"},
    )
    assert res.status_code == 404
