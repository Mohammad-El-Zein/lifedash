from tests.test_meals import _meal, _other_user_headers


def _ingredient(client, headers, name="Chicken breast", **overrides):
    payload = {
        "name": name,
        "calories_per_100g": "110",
        "protein_per_100g": "23",
        "carbs_per_100g": "0",
        "fat_per_100g": "1.5",
        "piece_grams": None,
    }
    payload.update(overrides)
    res = client.post("/api/meals/ingredients", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _shawarma_setup(client, headers):
    chicken = _ingredient(client, headers)
    tortilla = _ingredient(
        client,
        headers,
        name="Tortilla",
        calories_per_100g="300",
        protein_per_100g="8",
        carbs_per_100g="50",
        fat_per_100g="7",
        piece_grams="90",
    )
    res = client.post(
        "/api/meals/templates",
        headers=headers,
        json={
            "name": "Shawarma",
            "items": [
                {"ingredient_id": chicken["id"], "unit": "g", "amount": "200"},
                {"ingredient_id": tortilla["id"], "unit": "piece", "amount": "2"},
            ],
        },
    )
    assert res.status_code == 201, res.text
    return chicken, tortilla, res.json()


def test_ingredient_crud_and_duplicate(client, auth_headers):
    ing = _ingredient(client, auth_headers)
    assert ing["calories_per_100g"] == "110.0"

    res = client.post(
        "/api/meals/ingredients",
        headers=auth_headers,
        json={
            "name": "Chicken breast",
            "calories_per_100g": "1",
            "protein_per_100g": "1",
            "carbs_per_100g": "1",
            "fat_per_100g": "1",
        },
    )
    assert res.status_code == 409

    res = client.put(
        f"/api/meals/ingredients/{ing['id']}",
        headers=auth_headers,
        json={
            "name": "Chicken thigh",
            "calories_per_100g": "180",
            "protein_per_100g": "19",
            "carbs_per_100g": "0",
            "fat_per_100g": "11",
            "piece_grams": None,
        },
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Chicken thigh"

    res = client.delete(f"/api/meals/ingredients/{ing['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/api/meals/ingredients", headers=auth_headers).json() == []


def test_template_computes_totals(client, auth_headers):
    _, _, template = _shawarma_setup(client, auth_headers)
    # chicken 200 g: 220 kcal, 46 P, 0 C, 3 F
    # tortilla 2 × 90 g = 180 g: 540 kcal, 14.4 P, 90 C, 12.6 F
    assert template["totals"] == {
        "calories": "760.0",
        "protein_g": "60.4",
        "carbs_g": "90.0",
        "fat_g": "15.6",
    }
    grams = {i["ingredient_name"]: i["grams"] for i in template["items"]}
    assert grams == {"Chicken breast": "200.0", "Tortilla": "180.0"}


def test_template_piece_requires_piece_grams(client, auth_headers):
    chicken = _ingredient(client, auth_headers)  # no piece_grams
    res = client.post(
        "/api/meals/templates",
        headers=auth_headers,
        json={
            "name": "X",
            "items": [{"ingredient_id": chicken["id"], "unit": "piece", "amount": "1"}],
        },
    )
    assert res.status_code == 422


def test_template_rejects_foreign_ingredient(client, auth_headers):
    other = _other_user_headers(client)
    foreign = _ingredient(client, other, name="Rice")
    res = client.post(
        "/api/meals/templates",
        headers=auth_headers,
        json={
            "name": "X",
            "items": [{"ingredient_id": foreign["id"], "unit": "g", "amount": "100"}],
        },
    )
    assert res.status_code == 404


def test_template_update_replaces_items(client, auth_headers):
    chicken, tortilla, template = _shawarma_setup(client, auth_headers)
    res = client.put(
        f"/api/meals/templates/{template['id']}",
        headers=auth_headers,
        json={
            "name": "Shawarma light",
            "items": [{"ingredient_id": chicken["id"], "unit": "g", "amount": "150"}],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Shawarma light"
    assert len(body["items"]) == 1
    assert body["totals"]["calories"] == "165.0"


def test_ingredient_in_use_cannot_be_deleted(client, auth_headers):
    chicken, _, _ = _shawarma_setup(client, auth_headers)
    res = client.delete(f"/api/meals/ingredients/{chicken['id']}", headers=auth_headers)
    assert res.status_code == 409


def test_piece_grams_removal_blocked_while_used(client, auth_headers):
    _, tortilla, _ = _shawarma_setup(client, auth_headers)
    res = client.put(
        f"/api/meals/ingredients/{tortilla['id']}",
        headers=auth_headers,
        json={
            "name": "Tortilla",
            "calories_per_100g": "300",
            "protein_per_100g": "8",
            "carbs_per_100g": "50",
            "fat_per_100g": "7",
            "piece_grams": None,
        },
    )
    assert res.status_code == 409


def test_log_from_template_snapshots_values(client, auth_headers):
    _, _, template = _shawarma_setup(client, auth_headers)
    res = client.post(
        "/api/meals/from-template",
        headers=auth_headers,
        json={"date": "2026-07-07", "meal_type": "lunch", "template_id": template["id"]},
    )
    assert res.status_code == 201, res.text
    meal = res.json()
    assert meal["name"] == "Shawarma"
    assert meal["calories"] == 760
    assert meal["protein_g"] == 60
    assert meal["carbs_g"] == 90
    assert meal["fat_g"] == 16
    assert meal["template_id"] == template["id"]

    # editing the template afterwards must not change the logged meal
    chicken_id = template["items"][0]["ingredient_id"]
    res = client.put(
        f"/api/meals/templates/{template['id']}",
        headers=auth_headers,
        json={
            "name": "Shawarma",
            "items": [{"ingredient_id": chicken_id, "unit": "g", "amount": "50"}],
        },
    )
    assert res.status_code == 200
    day = client.get("/api/meals?date=2026-07-07", headers=auth_headers).json()
    assert day[0]["calories"] == 760


def test_log_from_template_portion_factor(client, auth_headers):
    _, _, template = _shawarma_setup(client, auth_headers)
    res = client.post(
        "/api/meals/from-template",
        headers=auth_headers,
        json={
            "date": "2026-07-07",
            "meal_type": "dinner",
            "template_id": template["id"],
            "portion_factor": "0.5",
        },
    )
    assert res.status_code == 201
    assert res.json()["calories"] == 380


def test_template_delete_keeps_logged_meal(client, auth_headers):
    _, _, template = _shawarma_setup(client, auth_headers)
    res = client.post(
        "/api/meals/from-template",
        headers=auth_headers,
        json={"date": "2026-07-07", "meal_type": "lunch", "template_id": template["id"]},
    )
    meal_id = res.json()["id"]
    res = client.delete(f"/api/meals/templates/{template['id']}", headers=auth_headers)
    assert res.status_code == 204
    day = client.get("/api/meals?date=2026-07-07", headers=auth_headers).json()
    assert [m["id"] for m in day] == [meal_id]
    assert day[0]["calories"] == 760
    assert day[0]["template_id"] is None


def test_manual_meal_supports_fat(client, auth_headers):
    meal = _meal(client, auth_headers, fat_g=17)
    assert meal["fat_g"] == 17


def test_template_tenancy(client, auth_headers):
    _, _, template = _shawarma_setup(client, auth_headers)
    other = _other_user_headers(client)
    assert client.get("/api/meals/templates", headers=other).json() == []
    res = client.post(
        "/api/meals/from-template",
        headers=other,
        json={"date": "2026-07-07", "meal_type": "lunch", "template_id": template["id"]},
    )
    assert res.status_code == 404


def test_from_template_enforces_meal_bounds(client, auth_headers):
    """Computed snapshots must respect the same limits as manual meals instead
    of overflowing the INTEGER columns (500 before the guard)."""
    ing = _ingredient(
        client,
        auth_headers,
        name="Bulk oil",
        calories_per_100g="1000",
        fat_per_100g="100",
        piece_grams="10000",
    )
    res = client.post(
        "/api/meals/templates",
        headers=auth_headers,
        json={
            "name": "Overflow dish",
            "items": [{"ingredient_id": ing["id"], "unit": "piece", "amount": "100000"}],
        },
    )
    assert res.status_code == 201
    res = client.post(
        "/api/meals/from-template",
        headers=auth_headers,
        json={
            "date": "2026-07-07",
            "meal_type": "snack",
            "template_id": res.json()["id"],
            "portion_factor": "10",
        },
    )
    assert res.status_code == 422
    assert "portion" in res.json()["detail"].lower()


def test_from_template_at_the_bound_still_works(client, auth_headers):
    ing = _ingredient(client, auth_headers, name="Dense", calories_per_100g="1000")
    res = client.post(
        "/api/meals/templates",
        headers=auth_headers,
        json={
            "name": "Exactly 10000",
            "items": [{"ingredient_id": ing["id"], "unit": "g", "amount": "1000"}],
        },
    )
    res = client.post(
        "/api/meals/from-template",
        headers=auth_headers,
        json={"date": "2026-07-07", "meal_type": "lunch", "template_id": res.json()["id"]},
    )
    assert res.status_code == 201
    assert res.json()["calories"] == 10000


def test_manual_edit_severs_template_link(client, auth_headers):
    _, _, template = _shawarma_setup(client, auth_headers)
    res = client.post(
        "/api/meals/from-template",
        headers=auth_headers,
        json={"date": "2026-07-07", "meal_type": "lunch", "template_id": template["id"]},
    )
    meal = res.json()
    assert meal["template_id"] == template["id"]

    res = client.put(
        f"/api/meals/{meal['id']}",
        headers=auth_headers,
        json={
            "date": "2026-07-07",
            "meal_type": "lunch",
            "name": meal["name"],
            "calories": 500,
            "protein_g": None,
            "carbs_g": None,
            "fat_g": None,
        },
    )
    assert res.status_code == 200
    assert res.json()["template_id"] is None


def test_totals_round_half_up(client, auth_headers):
    """4.9 kcal/100g × 50 g = 2.45 → half-up 2.5 (half-even would give 2.4)."""
    ing = _ingredient(
        client,
        auth_headers,
        name="Boundary",
        calories_per_100g="4.9",
        protein_per_100g="0",
        carbs_per_100g="0",
        fat_per_100g="0",
    )
    res = client.post(
        "/api/meals/templates",
        headers=auth_headers,
        json={
            "name": "Boundary dish",
            "items": [{"ingredient_id": ing["id"], "unit": "g", "amount": "50"}],
        },
    )
    assert res.json()["totals"]["calories"] == "2.5"
