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


def test_password_over_72_bytes_rejected(client):
    # 72 chars but 144 UTF-8 bytes — bcrypt would silently truncate this.
    res = client.post(
        "/api/auth/register", json={"email": "z@example.com", "password": "ä" * 72}
    )
    assert res.status_code == 422

    res = client.post(
        "/api/auth/register", json={"email": "z2@example.com", "password": "a" * 73}
    )
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


# --- Hardening: secret-key guard & rate limiting -----------------------------------


def test_settings_reject_dev_defaults_outside_dev():
    import pytest

    from app.core.config import DEV_SECRET_KEY, Settings

    prod_overrides = {
        "secret_key": "x" * 48,
        "database_url": "postgresql+psycopg://app:pw@prod-host:5432/lifedash",
        "azure_storage_connection_string": (
            "DefaultEndpointsProtocol=https;AccountName=prodacct;"
            "AccountKey=k;EndpointSuffix=core.windows.net"
        ),
    }

    # each dev default on its own must fail loudly, naming the variable
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(
            environment="production",
            _env_file=None,
            **{**prod_overrides, "secret_key": DEV_SECRET_KEY},
        )
    with pytest.raises(ValueError, match="DATABASE_URL"):
        Settings(
            environment="production",
            _env_file=None,
            **{k: v for k, v in prod_overrides.items() if k != "database_url"},
        )
    with pytest.raises(ValueError, match="AZURE_STORAGE_CONNECTION_STRING"):
        Settings(
            environment="production",
            _env_file=None,
            **{k: v for k, v in prod_overrides.items() if k != "azure_storage_connection_string"},
        )

    # fully configured production is fine, and dev keeps working with defaults
    Settings(environment="production", _env_file=None, **prod_overrides)
    Settings(environment="dev", _env_file=None)


def test_login_rate_limited_after_repeated_attempts(client):
    from app.core.rate_limit import login_limiter

    payload = {"email": "nobody@example.com", "password": "wrong-password"}
    for _ in range(login_limiter.limit):
        assert client.post("/api/auth/login", json=payload).status_code == 401
    res = client.post("/api/auth/login", json=payload)
    assert res.status_code == 429
    assert "Retry-After" in res.headers


def test_login_rate_limit_uses_forwarded_client_ip(client):
    """Behind the prod proxies every request shares one socket IP; the limiter
    must key on X-Forwarded-For so one client can't exhaust everyone's budget."""
    from app.core.rate_limit import login_limiter

    def attempt(ip: str, email: str) -> int:
        return client.post(
            "/api/auth/login",
            json={"email": email, "password": "wrong-password"},
            headers={"X-Forwarded-For": f"{ip}, 10.0.0.1"},
        ).status_code

    for i in range(login_limiter.limit):
        assert attempt("203.0.113.5", f"a{i}@example.com") == 401
    assert attempt("203.0.113.5", "a-final@example.com") == 429
    # a different forwarded client is unaffected
    assert attempt("203.0.113.99", "b@example.com") == 401


def test_login_rate_limited_per_email_across_ips(client):
    """Rotating (spoofed) client IPs must not allow unlimited attempts against
    a single account."""
    from app.core.rate_limit import login_email_limiter

    for i in range(login_email_limiter.limit):
        res = client.post(
            "/api/auth/login",
            json={"email": "victim@example.com", "password": "wrong-password"},
            headers={"X-Forwarded-For": f"198.51.100.{i}"},
        )
        assert res.status_code == 401
    res = client.post(
        "/api/auth/login",
        json={"email": "victim@example.com", "password": "wrong-password"},
        headers={"X-Forwarded-For": "198.51.100.200"},
    )
    assert res.status_code == 429


def test_register_rate_limited(client):
    from app.core.rate_limit import register_limiter

    for i in range(register_limiter.limit):
        res = client.post(
            "/api/auth/register",
            json={"email": f"user{i}@example.com", "password": "supersecret1"},
        )
        assert res.status_code == 201
    res = client.post(
        "/api/auth/register",
        json={"email": "toolate@example.com", "password": "supersecret1"},
    )
    assert res.status_code == 429
