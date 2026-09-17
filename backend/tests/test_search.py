def _other_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123"},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _search(client, headers, query):
    res = client.get("/api/search", headers=headers, params={"q": query})
    assert res.status_code == 200, res.text
    return res.json()["results"]


def _seed(client, headers):
    client.post(
        "/api/jobs/applications",
        headers=headers,
        json={
            "company": "Wilo SE",
            "position": "Junior Software Engineer",
            "link": None,
            "applied_date": "2026-07-01",
            "notes": None,
        },
    )
    client.post(
        "/api/finance/transactions",
        headers=headers,
        json={
            "kind": "expense",
            "amount": "42.50",
            "description": "Wilo parking garage",
            "date": "2026-07-02",
            "category_id": None,
        },
    )
    client.post(
        "/api/habits",
        headers=headers,
        json={"name": "Wilo commute by bike", "schedule_days": None},
    )


def test_search_spans_modules(client, auth_headers):
    _seed(client, auth_headers)

    results = _search(client, auth_headers, "wilo")

    by_module = {hit["module"]: hit for hit in results}
    assert set(by_module) == {"jobs", "finance", "habits"}
    assert by_module["jobs"]["title"] == "Wilo SE"
    assert by_module["jobs"]["subtitle"] == "Junior Software Engineer"
    # Expenses come back signed so the palette can render them without extra lookups.
    assert by_module["finance"]["amount"] == "-42.50"
    assert by_module["finance"]["date"] == "2026-07-02"


def test_search_matches_secondary_fields(client, auth_headers):
    client.post(
        "/api/jobs/applications",
        headers=auth_headers,
        json={
            "company": "Acme GmbH",
            "position": "Backend Engineer",
            "link": None,
            "applied_date": None,
            "notes": "Referral from Max",
        },
    )

    assert [hit["title"] for hit in _search(client, auth_headers, "referral")] == ["Acme GmbH"]
    assert [hit["title"] for hit in _search(client, auth_headers, "backend")] == ["Acme GmbH"]


def test_search_is_case_insensitive_and_needs_two_chars(client, auth_headers):
    _seed(client, auth_headers)

    assert _search(client, auth_headers, "WILO SE")[0]["title"] == "Wilo SE"
    assert _search(client, auth_headers, "w") == []
    assert _search(client, auth_headers, "   ") == []


def test_search_treats_wildcards_as_literals(client, auth_headers):
    _seed(client, auth_headers)

    # Without escaping, "%" would match every row.
    assert _search(client, auth_headers, "%") == []
    assert _search(client, auth_headers, "w%o") == []


def test_search_never_crosses_tenants(client, auth_headers):
    _seed(client, auth_headers)
    other = _other_headers(client)

    assert _search(client, other, "wilo") == []
    assert len(_search(client, auth_headers, "wilo")) == 3


def test_search_requires_authentication(client):
    assert client.get("/api/search", params={"q": "wilo"}).status_code == 401
