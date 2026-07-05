def _category(client, headers, name="Groceries", kind="expense", color="#3987e5"):
    res = client.post(
        "/api/finance/categories",
        headers=headers,
        json={"name": name, "kind": kind, "color": color},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _transaction(client, headers, **overrides):
    payload = {
        "kind": "expense",
        "amount": 25.5,
        "description": "Weekly shop",
        "date": "2026-07-03",
        "category_id": None,
    }
    payload.update(overrides)
    res = client.post("/api/finance/transactions", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_category_crud_and_duplicate(client, auth_headers):
    cat = _category(client, auth_headers)
    res = client.post(
        "/api/finance/categories",
        headers=auth_headers,
        json={"name": "Groceries", "kind": "expense"},
    )
    assert res.status_code == 409

    res = client.put(
        f"/api/finance/categories/{cat['id']}",
        headers=auth_headers,
        json={"name": "Food", "color": "#c98500"},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Food"

    assert (
        client.delete(f"/api/finance/categories/{cat['id']}", headers=auth_headers).status_code
        == 204
    )
    assert client.get("/api/finance/categories", headers=auth_headers).json() == []


def test_transaction_kind_must_match_category(client, auth_headers):
    cat = _category(client, auth_headers, kind="expense")
    res = client.post(
        "/api/finance/transactions",
        headers=auth_headers,
        json={
            "kind": "income",
            "amount": 100,
            "date": "2026-07-01",
            "category_id": cat["id"],
        },
    )
    assert res.status_code == 422


def test_transaction_month_filter(client, auth_headers):
    _transaction(client, auth_headers, date="2026-07-03")
    _transaction(client, auth_headers, date="2026-06-28", description="Old")

    res = client.get(
        "/api/finance/transactions", headers=auth_headers, params={"month": "2026-07-15"}
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["date"] == "2026-07-03"


def test_budget_upsert_normalises_month(client, auth_headers):
    cat = _category(client, auth_headers)
    res = client.put(
        "/api/finance/budgets",
        headers=auth_headers,
        json={"category_id": cat["id"], "month": "2026-07-19", "amount": 300},
    )
    assert res.status_code == 200
    assert res.json()["month"] == "2026-07-01"

    # Second upsert for the same month updates instead of duplicating.
    res = client.put(
        "/api/finance/budgets",
        headers=auth_headers,
        json={"category_id": cat["id"], "month": "2026-07-01", "amount": 350},
    )
    assert res.status_code == 200
    budgets = client.get(
        "/api/finance/budgets", headers=auth_headers, params={"month": "2026-07-05"}
    ).json()
    assert len(budgets) == 1
    assert budgets[0]["amount"] == 350


def test_budget_rejected_for_income_category(client, auth_headers):
    cat = _category(client, auth_headers, name="Salary", kind="income")
    res = client.put(
        "/api/finance/budgets",
        headers=auth_headers,
        json={"category_id": cat["id"], "month": "2026-07-01", "amount": 100},
    )
    assert res.status_code == 422


def test_month_summary(client, auth_headers):
    food = _category(client, auth_headers, name="Food")
    rent = _category(client, auth_headers, name="Rent")
    salary = _category(client, auth_headers, name="Salary", kind="income")

    _transaction(client, auth_headers, amount=1200, category_id=rent["id"], date="2026-07-01")
    _transaction(client, auth_headers, amount=150.25, category_id=food["id"], date="2026-07-02")
    _transaction(client, auth_headers, amount=49.75, category_id=food["id"], date="2026-07-20")
    _transaction(client, auth_headers, amount=30, category_id=None, date="2026-07-04")
    _transaction(
        client,
        auth_headers,
        kind="income",
        amount=2800,
        category_id=salary["id"],
        date="2026-07-01",
    )
    _transaction(client, auth_headers, amount=999, date="2026-06-30", description="last month")

    client.put(
        "/api/finance/budgets",
        headers=auth_headers,
        json={"category_id": food["id"], "month": "2026-07-01", "amount": 400},
    )

    res = client.get("/api/finance/summary", headers=auth_headers, params={"month": "2026-07-10"})
    assert res.status_code == 200
    body = res.json()
    assert body["month"] == "2026-07-01"
    assert body["income_total"] == 2800
    assert body["expense_total"] == 1430
    assert body["net"] == 1370

    by_name = {c["name"]: c for c in body["expenses_by_category"]}
    assert by_name["Rent"]["spent"] == 1200
    assert by_name["Food"]["spent"] == 200
    assert by_name["Food"]["budget"] == 400
    assert by_name["Uncategorised"]["spent"] == 30
    # Sorted by spent, descending.
    assert [c["name"] for c in body["expenses_by_category"]] == ["Rent", "Food", "Uncategorised"]


def test_finance_user_isolation(client, auth_headers):
    cat = _category(client, auth_headers)
    _transaction(client, auth_headers, category_id=cat["id"])

    res = client.post(
        "/api/auth/register", json={"email": "other-fin@example.com", "password": "password123"}
    )
    other = {"Authorization": f"Bearer {res.json()['access_token']}"}

    assert client.get("/api/finance/transactions", headers=other).json() == []
    assert client.get("/api/finance/categories", headers=other).json() == []
    res = client.put(
        "/api/finance/budgets",
        headers=other,
        json={"category_id": cat["id"], "month": "2026-07-01", "amount": 10},
    )
    assert res.status_code == 404  # can't budget someone else's category
