def _meal(client, headers, **overrides):
    payload = {
        "date": "2026-07-07",
        "meal_type": "breakfast",
        "name": "Oatmeal with berries",
        "calories": 420,
        "protein_g": 14,
        "carbs_g": 62,
    }
    payload.update(overrides)
    res = client.post("/api/meals", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _other_user_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "supersecret1", "full_name": "Other"},
    )
    assert res.status_code == 201
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_meal_crud(client, auth_headers):
    meal = _meal(client, auth_headers)
    assert meal["calories"] == 420
    assert meal["protein_g"] == 14

    res = client.put(
        f"/api/meals/{meal['id']}",
        headers=auth_headers,
        json={
            "date": "2026-07-07",
            "meal_type": "lunch",
            "name": "Chicken bowl",
            "calories": 650,
            "protein_g": 45,
            "carbs_g": None,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["meal_type"] == "lunch"
    assert body["carbs_g"] is None

    res = client.delete(f"/api/meals/{meal['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/api/meals?date=2026-07-07", headers=auth_headers).json() == []


def test_list_filters_by_date(client, auth_headers):
    _meal(client, auth_headers, date="2026-07-07", name="Today breakfast")
    _meal(client, auth_headers, date="2026-07-07", meal_type="dinner", name="Today dinner")
    _meal(client, auth_headers, date="2026-07-08", name="Tomorrow breakfast")

    today = client.get("/api/meals?date=2026-07-07", headers=auth_headers).json()
    assert [m["name"] for m in today] == ["Today breakfast", "Today dinner"]
    tomorrow = client.get("/api/meals?date=2026-07-08", headers=auth_headers).json()
    assert [m["name"] for m in tomorrow] == ["Tomorrow breakfast"]


def test_calories_required_and_bounded(client, auth_headers):
    payload = {"date": "2026-07-07", "meal_type": "snack", "name": "Mystery"}
    res = client.post("/api/meals", headers=auth_headers, json=payload)
    assert res.status_code == 422

    res = client.post(
        "/api/meals", headers=auth_headers, json={**payload, "calories": -5}
    )
    assert res.status_code == 422


def test_invalid_meal_type_rejected(client, auth_headers):
    res = client.post(
        "/api/meals",
        headers=auth_headers,
        json={"date": "2026-07-07", "meal_type": "brunch", "name": "X", "calories": 100},
    )
    assert res.status_code == 422


def test_macros_are_optional(client, auth_headers):
    meal = _meal(client, auth_headers, protein_g=None, carbs_g=None)
    assert meal["protein_g"] is None
    assert meal["carbs_g"] is None


def test_meal_tenancy(client, auth_headers):
    meal = _meal(client, auth_headers)
    other = _other_user_headers(client)
    assert client.get("/api/meals?date=2026-07-07", headers=other).json() == []
    res = client.delete(f"/api/meals/{meal['id']}", headers=other)
    assert res.status_code == 404


def test_requires_auth(client):
    assert client.get("/api/meals?date=2026-07-07").status_code == 401
