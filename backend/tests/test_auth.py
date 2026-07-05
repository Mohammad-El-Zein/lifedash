def test_register_and_login(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "anna@example.com", "password": "password123", "full_name": "Anna"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["user"]["email"] == "anna@example.com"
    assert body["user"]["role"] == "user"
    assert "calendar" in body["user"]["enabled_modules"]

    res = client.post(
        "/api/auth/login", json={"email": "anna@example.com", "password": "password123"}
    )
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "password123"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"email": "x@example.com", "password": "password123"})
    res = client.post("/api/auth/login", json={"email": "x@example.com", "password": "wrongpass1"})
    assert res.status_code == 401


def test_short_password_rejected(client):
    res = client.post("/api/auth/register", json={"email": "y@example.com", "password": "short"})
    assert res.status_code == 422


def test_me_requires_auth(client):
    assert client.get("/api/users/me").status_code == 401


def test_me_returns_user(client, auth_headers):
    res = client.get("/api/users/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "test@example.com"


def test_update_enabled_modules(client, auth_headers):
    res = client.patch(
        "/api/users/me", headers=auth_headers, json={"enabled_modules": ["calendar", "finance"]}
    )
    assert res.status_code == 200
    assert res.json()["enabled_modules"] == ["calendar", "finance"]

    res = client.patch(
        "/api/users/me", headers=auth_headers, json={"enabled_modules": ["nope"]}
    )
    assert res.status_code == 422
