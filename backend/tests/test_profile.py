# 1x1 PNG and minimal valid magic-byte payloads
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fcffff3f030005fe02fea7568c4b0000000049454e44ae426082"
)
JPEG_HEADER = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP_HEADER = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32


def upload_avatar(client, headers, content=PNG, ctype="image/png", name="me.png"):
    return client.post(
        "/api/users/me/avatar", files={"file": (name, content, ctype)}, headers=headers
    )


def test_profile_update_and_clear(client, auth_headers):
    res = client.patch(
        "/api/users/me",
        json={"job_title": "Backend Engineer", "bio": "I build APIs."},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["job_title"] == "Backend Engineer"
    assert body["bio"] == "I build APIs."
    assert body["full_name"] == "Test User"  # untouched: not in payload
    assert body["has_avatar"] is False

    res = client.patch("/api/users/me", json={"bio": None}, headers=auth_headers)
    assert res.json()["bio"] is None
    assert res.json()["job_title"] == "Backend Engineer"


def test_avatar_upload_download_roundtrip(client, auth_headers, avatar_storage):
    res = upload_avatar(client, auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["has_avatar"] is True
    assert len(avatar_storage.blobs) == 1

    res = client.get("/api/users/me/avatar", headers=auth_headers)
    assert res.status_code == 200
    assert res.content == PNG
    assert res.headers["content-type"] == "image/png"


def test_avatar_replace_deletes_old_blob(client, auth_headers, avatar_storage):
    upload_avatar(client, auth_headers)
    res = upload_avatar(client, auth_headers, content=JPEG_HEADER, ctype="image/jpeg", name="a.jpg")
    assert res.status_code == 200
    assert len(avatar_storage.blobs) == 1  # old blob replaced, not accumulated
    res = client.get("/api/users/me/avatar", headers=auth_headers)
    assert res.headers["content-type"] == "image/jpeg"


def test_avatar_webp_accepted(client, auth_headers):
    res = upload_avatar(
        client, auth_headers, content=WEBP_HEADER, ctype="image/webp", name="a.webp"
    )
    assert res.status_code == 200


def test_avatar_rejects_bad_type_and_content(client, auth_headers, avatar_storage):
    res = upload_avatar(client, auth_headers, ctype="application/pdf")
    assert res.status_code == 422
    res = upload_avatar(client, auth_headers, content=b"not an image")
    assert res.status_code == 422
    assert avatar_storage.blobs == {}


def test_avatar_rejects_oversize(client, auth_headers, avatar_storage):
    big = b"\x89PNG\r\n\x1a\n" + b"0" * (2 * 1024 * 1024)
    res = upload_avatar(client, auth_headers, content=big)
    assert res.status_code == 413
    assert avatar_storage.blobs == {}


def test_avatar_delete(client, auth_headers, avatar_storage):
    upload_avatar(client, auth_headers)
    res = client.delete("/api/users/me/avatar", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["has_avatar"] is False
    assert avatar_storage.blobs == {}
    assert client.get("/api/users/me/avatar", headers=auth_headers).status_code == 404
