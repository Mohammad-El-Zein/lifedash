from datetime import date

import pytest


@pytest.fixture()
def frozen_today(monkeypatch):
    """Pin 'today' inside the finance router so current-month logic is deterministic."""

    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 7, 5)

    monkeypatch.setattr("app.routers.finance.date", FixedDate)


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


# --- Recurring transactions -------------------------------------------------------


def _recurring(client, headers, **overrides):
    payload = {
        "kind": "expense",
        "amount": 800,
        "description": "Rent",
        "day_of_month": 1,
        "start_month": "2026-01-01",
        "end_month": None,
        "category_id": None,
        "is_active": True,
    }
    payload.update(overrides)
    res = client.post("/api/finance/recurring", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _month_txs(client, headers, month):
    res = client.get("/api/finance/transactions", headers=headers, params={"month": month})
    assert res.status_code == 200, res.text
    return res.json()


def test_recurring_crud_and_normalisation(client, auth_headers):
    rec = _recurring(client, auth_headers, start_month="2026-01-15", end_month="2026-06-20")
    assert rec["start_month"] == "2026-01-01"
    assert rec["end_month"] == "2026-06-01"

    res = client.put(
        f"/api/finance/recurring/{rec['id']}",
        headers=auth_headers,
        json={
            "kind": "expense",
            "amount": 850,
            "description": "Rent (new lease)",
            "day_of_month": 2,
            "start_month": "2026-01-01",
            "end_month": None,
            "category_id": None,
            "is_active": True,
        },
    )
    assert res.status_code == 200
    assert res.json()["amount"] == 850

    # end before start is rejected
    res = client.post(
        "/api/finance/recurring",
        headers=auth_headers,
        json={
            "kind": "expense",
            "amount": 1,
            "description": "Broken",
            "day_of_month": 1,
            "start_month": "2026-05-01",
            "end_month": "2026-04-01",
        },
    )
    assert res.status_code == 422

    assert (
        client.delete(f"/api/finance/recurring/{rec['id']}", headers=auth_headers).status_code
        == 204
    )
    assert client.get("/api/finance/recurring", headers=auth_headers).json() == []


def test_recurring_category_kind_must_match(client, auth_headers):
    cat = _category(client, auth_headers, name="Salary", kind="income")
    res = client.post(
        "/api/finance/recurring",
        headers=auth_headers,
        json={
            "kind": "expense",
            "amount": 100,
            "description": "Mismatch",
            "day_of_month": 1,
            "start_month": "2026-01-01",
            "category_id": cat["id"],
        },
    )
    assert res.status_code == 422


def test_materialisation_is_lazy_idempotent_and_unpaid(client, auth_headers):
    salary = _recurring(
        client, auth_headers, kind="income", amount=1300, description="Salary", day_of_month=1
    )
    _recurring(client, auth_headers, amount=800, description="Rent", day_of_month=1)
    _recurring(client, auth_headers, amount=42.5, description="Insurance", day_of_month=5)

    txs = _month_txs(client, auth_headers, "2026-07-15")
    assert len(txs) == 3
    by_desc = {t["description"]: t for t in txs}
    assert by_desc["Salary"]["status"] == "unpaid"
    assert by_desc["Salary"]["kind"] == "income"
    assert by_desc["Salary"]["date"] == "2026-07-01"
    assert by_desc["Salary"]["recurring_id"] == salary["id"]
    assert by_desc["Insurance"]["date"] == "2026-07-05"

    # Loading the same month again must not duplicate anything.
    assert len(_month_txs(client, auth_headers, "2026-07-01")) == 3
    # A different month within the window materialises its own instances.
    assert len(_month_txs(client, auth_headers, "2026-08-01")) == 3


def test_materialisation_respects_window_and_active_flag(client, auth_headers):
    _recurring(
        client,
        auth_headers,
        description="Gym",
        start_month="2026-03-01",
        end_month="2026-04-30",
    )
    _recurring(client, auth_headers, description="Paused", is_active=False)

    assert _month_txs(client, auth_headers, "2026-02-01") == []
    assert len(_month_txs(client, auth_headers, "2026-03-01")) == 1
    assert len(_month_txs(client, auth_headers, "2026-04-01")) == 1
    assert _month_txs(client, auth_headers, "2026-05-01") == []


def test_materialisation_clamps_day_of_month(client, auth_headers):
    _recurring(client, auth_headers, description="EOM bill", day_of_month=31)
    txs = _month_txs(client, auth_headers, "2026-02-10")
    assert txs[0]["date"] == "2026-02-28"
    txs = _month_txs(client, auth_headers, "2026-04-10")
    assert txs[0]["date"] == "2026-04-30"


def test_editing_generated_transaction_persists(client, auth_headers):
    _recurring(client, auth_headers, description="Rent", amount=800)
    tx = _month_txs(client, auth_headers, "2026-07-01")[0]

    res = client.put(
        f"/api/finance/transactions/{tx['id']}",
        headers=auth_headers,
        json={
            "kind": "expense",
            "amount": 750,
            "description": "Rent (reduced)",
            "date": "2026-07-03",
            "category_id": None,
            "status": "paid",
        },
    )
    assert res.status_code == 200

    txs = _month_txs(client, auth_headers, "2026-07-01")
    assert len(txs) == 1  # not re-materialised on top of the edit
    assert txs[0]["amount"] == 750
    assert txs[0]["status"] == "paid"


def test_status_toggle_and_defaults(client, auth_headers):
    one_off = _transaction(client, auth_headers)
    assert one_off["status"] == "paid"

    res = client.patch(
        f"/api/finance/transactions/{one_off['id']}/status",
        headers=auth_headers,
        json={"status": "unpaid"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "unpaid"

    res = client.patch(
        f"/api/finance/transactions/{one_off['id']}/status",
        headers=auth_headers,
        json={"status": "nope"},
    )
    assert res.status_code == 422


def test_skip_month_and_unskip(client, auth_headers):
    rec = _recurring(client, auth_headers, description="Rent")
    assert len(_month_txs(client, auth_headers, "2026-07-01")) == 1

    res = client.post(
        f"/api/finance/recurring/{rec['id']}/skips",
        headers=auth_headers,
        json={"month": "2026-07-19"},
    )
    assert res.status_code == 200
    assert res.json()["skipped_months"] == ["2026-07-01"]

    # Materialised instance is gone and does not come back.
    assert _month_txs(client, auth_headers, "2026-07-01") == []
    # Other months are unaffected.
    assert len(_month_txs(client, auth_headers, "2026-08-01")) == 1

    res = client.delete(
        f"/api/finance/recurring/{rec['id']}/skips/2026-07-01", headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["skipped_months"] == []
    assert len(_month_txs(client, auth_headers, "2026-07-01")) == 1


def test_deleting_generated_transaction_skips_month(client, auth_headers):
    rec = _recurring(client, auth_headers, description="Rent")
    tx = _month_txs(client, auth_headers, "2026-07-01")[0]

    res = client.delete(f"/api/finance/transactions/{tx['id']}", headers=auth_headers)
    assert res.status_code == 204

    assert _month_txs(client, auth_headers, "2026-07-01") == []
    recs = client.get("/api/finance/recurring", headers=auth_headers).json()
    assert recs[0]["id"] == rec["id"]
    assert recs[0]["skipped_months"] == ["2026-07-01"]


def test_deleting_template_keeps_history(client, auth_headers):
    rec = _recurring(client, auth_headers, description="Rent")
    tx = _month_txs(client, auth_headers, "2026-07-01")[0]

    res = client.delete(f"/api/finance/recurring/{rec['id']}", headers=auth_headers)
    assert res.status_code == 204

    txs = _month_txs(client, auth_headers, "2026-07-01")
    assert [t["id"] for t in txs] == [tx["id"]]
    assert txs[0]["recurring_id"] is None


# --- Monthly plan -------------------------------------------------------------------


def test_monthly_plan(client, auth_headers):
    _recurring(
        client, auth_headers, kind="income", amount=1300, description="Salary", day_of_month=1
    )
    _recurring(client, auth_headers, amount=800, description="Rent", day_of_month=1)
    _recurring(client, auth_headers, amount=50, description="Insurance", day_of_month=5)
    _transaction(client, auth_headers, kind="income", amount=200, description="Side gig")
    _transaction(client, auth_headers, amount=60, description="Groceries")

    res = client.get(
        "/api/finance/monthly-plan", headers=auth_headers, params={"month": "2026-07-10"}
    )
    assert res.status_code == 200
    plan = res.json()
    assert plan["month"] == "2026-07-01"
    assert plan["income_total"] == 1500
    assert plan["recurring_income_total"] == 1300
    assert plan["one_off_income_total"] == 200
    assert plan["fixed_expense_total"] == 850
    assert plan["variable_expense_total"] == 60
    assert plan["available_for_variable"] == 650
    assert plan["fixed_paid_count"] == 0
    assert plan["fixed_unpaid_count"] == 2
    assert len(plan["fixed_items"]) == 2

    # Mark rent paid and check the counters move.
    rent_item = next(i for i in plan["fixed_items"] if i["description"] == "Rent")
    client.patch(
        f"/api/finance/transactions/{rent_item['transaction_id']}/status",
        headers=auth_headers,
        json={"status": "paid"},
    )
    plan = client.get(
        "/api/finance/monthly-plan", headers=auth_headers, params={"month": "2026-07-10"}
    ).json()
    assert plan["fixed_paid_count"] == 1
    assert plan["fixed_unpaid_count"] == 1


# --- Savings goal ---------------------------------------------------------------------


def test_savings_settings_defaults_and_update(client, auth_headers, frozen_today):
    res = client.get("/api/finance/savings/settings", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["monthly_target"] == 100
    assert body["start_month"] == "2026-07-01"  # current month (today is 2026-07-05)

    res = client.put(
        "/api/finance/savings/settings",
        headers=auth_headers,
        json={"monthly_target": 150, "start_month": "2026-05-20"},
    )
    assert res.status_code == 200
    assert res.json() == {"monthly_target": 150, "start_month": "2026-05-01"}


def test_savings_overview_cumulative(client, auth_headers, frozen_today):
    client.put(
        "/api/finance/savings/settings",
        headers=auth_headers,
        json={"monthly_target": 100, "start_month": "2026-05-01"},
    )
    # May: saved exactly 100 (1000 income, 900 expenses)
    _transaction(client, auth_headers, kind="income", amount=1000, date="2026-05-01")
    _transaction(client, auth_headers, amount=900, date="2026-05-15")
    # June: saved only 50
    _transaction(client, auth_headers, kind="income", amount=1000, date="2026-06-01")
    _transaction(client, auth_headers, amount=950, date="2026-06-15")
    # July (current month): 200 so far
    _transaction(client, auth_headers, kind="income", amount=200, date="2026-07-02")

    res = client.get("/api/finance/savings", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["monthly_target"] == 100
    assert [m["month"] for m in body["months"]] == ["2026-05-01", "2026-06-01", "2026-07-01"]

    may, june, july = body["months"]
    assert may["saved"] == 100 and may["delta"] == 0 and may["is_current"] is False
    assert june["saved"] == 50 and june["delta"] == -50
    assert july["saved"] == 200 and july["delta"] == 100 and july["is_current"] is True

    assert body["target_total"] == 300
    assert body["saved_total"] == 350
    assert body["delta_total"] == 50


def test_savings_target_change_applies_retroactively(client, auth_headers, frozen_today):
    client.put(
        "/api/finance/savings/settings",
        headers=auth_headers,
        json={"monthly_target": 100, "start_month": "2026-06-01"},
    )
    _transaction(client, auth_headers, kind="income", amount=120, date="2026-06-10")

    client.put(
        "/api/finance/savings/settings",
        headers=auth_headers,
        json={"monthly_target": 200, "start_month": "2026-06-01"},
    )
    body = client.get("/api/finance/savings", headers=auth_headers).json()
    assert body["months"][0]["target"] == 200
    assert body["months"][0]["delta"] == -80
    assert body["target_total"] == 400  # 2 months × 200


def test_savings_overview_materialises_recurring(client, auth_headers, frozen_today):
    client.put(
        "/api/finance/savings/settings",
        headers=auth_headers,
        json={"monthly_target": 100, "start_month": "2026-06-01"},
    )
    _recurring(
        client, auth_headers, kind="income", amount=1300, description="Salary", day_of_month=1
    )
    _recurring(client, auth_headers, amount=800, description="Rent", day_of_month=1)

    body = client.get("/api/finance/savings", headers=auth_headers).json()
    june, july = body["months"]
    assert june["saved"] == 500  # materialised without the months ever being viewed
    assert july["saved"] == 500
    assert body["saved_total"] == 1000
    assert body["delta_total"] == 800


def test_recurring_user_isolation(client, auth_headers):
    rec = _recurring(client, auth_headers, description="Rent")

    res = client.post(
        "/api/auth/register", json={"email": "other-rec@example.com", "password": "password123"}
    )
    other = {"Authorization": f"Bearer {res.json()['access_token']}"}

    assert client.get("/api/finance/recurring", headers=other).json() == []
    res = client.get(
        "/api/finance/transactions", headers=other, params={"month": "2026-07-01"}
    )
    assert res.json() == []
    res = client.post(
        f"/api/finance/recurring/{rec['id']}/skips", headers=other, json={"month": "2026-07-01"}
    )
    assert res.status_code == 404
    res = client.get("/api/finance/savings", headers=other)
    assert res.status_code == 200
    assert res.json()["saved_total"] == 0


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
