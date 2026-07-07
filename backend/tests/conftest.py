import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models as _all_models  # noqa: F401  (register all tables on Base.metadata)
from app.core.rate_limit import login_limiter, register_limiter
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.storage import get_avatar_storage, get_storage


class FakeStorage:
    """In-memory stand-in for blob storage so tests need no Azurite."""

    def __init__(self):
        self.blobs: dict[str, bytes] = {}

    def upload(self, name: str, data: bytes, content_type: str) -> None:
        self.blobs[name] = data

    def download(self, name: str) -> bytes:
        if name not in self.blobs:
            raise FileNotFoundError(name)
        return self.blobs[name]

    def delete(self, name: str) -> None:
        self.blobs.pop(name, None)


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def storage():
    return FakeStorage()


@pytest.fixture()
def avatar_storage():
    return FakeStorage()


@pytest.fixture()
def client(db_session, storage, avatar_storage):
    # The in-process auth rate limiters accumulate across tests (same client IP
    # for every TestClient request) — start each test with a clean window.
    login_limiter.reset()
    register_limiter.reset()
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_avatar_storage] = lambda: avatar_storage
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client):
    res = client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "supersecret1", "full_name": "Test User"},
    )
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
