import pytest

PDF = b"%PDF-1.7\n%fake test pdf\n%%EOF"


@pytest.fixture()
def application_id(client, auth_headers):
    res = client.post(
        "/api/jobs/applications",
        json={"company": "ACME", "position": "Engineer"},
        headers=auth_headers,
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def upload(client, auth_headers, app_id, content=PDF, filename="cv.pdf", ctype="application/pdf"):
    return client.post(
        f"/api/jobs/applications/{app_id}/documents",
        files={"file": (filename, content, ctype)},
        headers=auth_headers,
    )


def test_upload_and_list_documents(client, auth_headers, storage, application_id):
    res = upload(client, auth_headers, application_id)
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["filename"] == "cv.pdf"
    assert doc["content_type"] == "application/pdf"
    assert doc["size_bytes"] == len(PDF)
    assert len(storage.blobs) == 1

    res = client.get(f"/api/jobs/applications/{application_id}", headers=auth_headers)
    docs = res.json()["documents"]
    assert [d["id"] for d in docs] == [doc["id"]]


def test_download_roundtrip(client, auth_headers, storage, application_id):
    doc = upload(client, auth_headers, application_id).json()
    res = client.get(f"/api/jobs/documents/{doc['id']}/download", headers=auth_headers)
    assert res.status_code == 200
    assert res.content == PDF
    assert res.headers["content-type"].startswith("application/pdf")
    assert 'filename="cv.pdf"' in res.headers["content-disposition"]


def test_rejects_wrong_content_type(client, auth_headers, storage, application_id):
    res = upload(client, auth_headers, application_id, ctype="image/png")
    assert res.status_code == 422
    assert storage.blobs == {}


def test_rejects_non_pdf_payload(client, auth_headers, storage, application_id):
    res = upload(client, auth_headers, application_id, content=b"not a pdf at all")
    assert res.status_code == 422
    assert storage.blobs == {}


def test_rejects_oversized_file(client, auth_headers, storage, application_id):
    big = b"%PDF-" + b"0" * (10 * 1024 * 1024)
    res = upload(client, auth_headers, application_id, content=big)
    assert res.status_code == 413
    assert storage.blobs == {}


def test_delete_document_removes_row_and_blob(client, auth_headers, storage, application_id):
    doc = upload(client, auth_headers, application_id).json()
    res = client.delete(f"/api/jobs/documents/{doc['id']}", headers=auth_headers)
    assert res.status_code == 204
    assert storage.blobs == {}
    res = client.get(f"/api/jobs/documents/{doc['id']}/download", headers=auth_headers)
    assert res.status_code == 404


def test_delete_application_deletes_blobs(client, auth_headers, storage, application_id):
    upload(client, auth_headers, application_id)
    upload(client, auth_headers, application_id, filename="letter.pdf")
    assert len(storage.blobs) == 2
    res = client.delete(f"/api/jobs/applications/{application_id}", headers=auth_headers)
    assert res.status_code == 204
    assert storage.blobs == {}


def test_documents_are_owner_scoped(client, auth_headers, storage, application_id):
    doc = upload(client, auth_headers, application_id).json()

    res = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "supersecret2"},
    )
    other = {"Authorization": f"Bearer {res.json()['access_token']}"}

    assert (
        client.get(f"/api/jobs/documents/{doc['id']}/download", headers=other).status_code == 404
    )
    assert client.delete(f"/api/jobs/documents/{doc['id']}", headers=other).status_code == 404
    assert upload(client, other, application_id).status_code == 404


def test_download_with_non_ascii_filename(client, auth_headers, storage, application_id):
    """Response headers are latin-1; non-ASCII names must use RFC 5987 encoding
    instead of 500ing."""
    res = upload(client, auth_headers, application_id, filename="Lebenslauf Prüfung 履歴書.pdf")
    doc = res.json()
    res = client.get(f"/api/jobs/documents/{doc['id']}/download", headers=auth_headers)
    assert res.status_code == 200
    disposition = res.headers["content-disposition"]
    assert "filename*=UTF-8''" in disposition
    assert 'filename="Lebenslauf Pr_fung' in disposition  # ASCII fallback present
    assert res.content == PDF


def test_upload_truncates_overlong_filename(client, auth_headers, storage, application_id):
    long_name = "x" * 300 + ".pdf"
    doc = upload(client, auth_headers, application_id, filename=long_name).json()
    assert len(doc["filename"]) == 255
