import re
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep, get_owned_or_404
from app.models.jobs import JobApplication, JobDocument, JobStatusHistory
from app.schemas.jobs import (
    STATUS_PATTERN,
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdate,
    DocumentOut,
    StatusChange,
)
from app.services.storage import StorageDep

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024  # 10 MB
PDF_MAGIC = b"%PDF-"
MAX_FILENAME_LENGTH = 255  # matches the JobDocument.filename column


def _content_disposition(filename: str) -> str:
    """RFC 6266/5987 attachment header. Response headers are latin-1, so a
    non-ASCII filename must go into the encoded filename* parameter with a
    plain-ASCII fallback — otherwise the download 500s on e.g. CJK names."""
    fallback = re.sub(r"[^A-Za-z0-9._ -]", "_", filename).strip() or "document.pdf"
    return f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(filename)}'


def _get_application(db: DbDep, user_id: int, application_id: int) -> JobApplication:
    return get_owned_or_404(
        db,
        JobApplication,
        user_id,
        application_id,
        options=(
            selectinload(JobApplication.status_history),
            selectinload(JobApplication.documents),
        ),
        detail="Application not found",
    )


@router.get("/applications", response_model=list[ApplicationOut])
def list_applications(
    current_user: CurrentUser,
    db: DbDep,
    status_filter: str | None = Query(default=None, alias="status", pattern=STATUS_PATTERN),
) -> list[JobApplication]:
    query = (
        select(JobApplication)
        .options(
            selectinload(JobApplication.status_history),
            selectinload(JobApplication.documents),
        )
        .where(JobApplication.user_id == current_user.id)
    )
    if status_filter is not None:
        query = query.where(JobApplication.status == status_filter)
    query = query.order_by(
        JobApplication.applied_date.desc().nulls_last(), JobApplication.id.desc()
    )
    return list(db.scalars(query))


@router.post("/applications", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationCreate, current_user: CurrentUser, db: DbDep
) -> JobApplication:
    application = JobApplication(user_id=current_user.id, **payload.model_dump())
    application.status_history.append(
        JobStatusHistory(user_id=current_user.id, status=payload.status, note="Created")
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


@router.get("/applications/{application_id}", response_model=ApplicationOut)
def get_application(
    application_id: int, current_user: CurrentUser, db: DbDep
) -> JobApplication:
    return _get_application(db, current_user.id, application_id)


@router.put("/applications/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: int, payload: ApplicationUpdate, current_user: CurrentUser, db: DbDep
) -> JobApplication:
    application = _get_application(db, current_user.id, application_id)
    for field, value in payload.model_dump().items():
        setattr(application, field, value)
    db.commit()
    db.refresh(application)
    return application


@router.post("/applications/{application_id}/status", response_model=ApplicationOut)
def change_status(
    application_id: int, payload: StatusChange, current_user: CurrentUser, db: DbDep
) -> JobApplication:
    application = _get_application(db, current_user.id, application_id)
    if application.status == payload.status:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Application already has this status"
        )
    application.status = payload.status
    application.status_history.append(
        JobStatusHistory(user_id=current_user.id, status=payload.status, note=payload.note)
    )
    db.commit()
    db.refresh(application)
    return application


@router.delete("/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    application_id: int, current_user: CurrentUser, db: DbDep, storage: StorageDep
) -> None:
    application = _get_application(db, current_user.id, application_id)
    for document in application.documents:
        storage.delete(document.blob_name)
    db.delete(application)
    db.commit()


# --- Documents --------------------------------------------------------------------


@router.post(
    "/applications/{application_id}/documents",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    application_id: int,
    file: UploadFile,
    current_user: CurrentUser,
    db: DbDep,
    storage: StorageDep,
) -> JobDocument:
    application = _get_application(db, current_user.id, application_id)
    if file.content_type != "application/pdf":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Only PDF files are allowed")
    data = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds the 10 MB limit"
        )
    if not data.startswith(PDF_MAGIC):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is not a valid PDF")

    blob_name = f"user-{current_user.id}/app-{application.id}/{uuid4().hex}.pdf"
    storage.upload(blob_name, data, "application/pdf")
    document = JobDocument(
        user_id=current_user.id,
        application_id=application.id,
        filename=(file.filename or "document.pdf")[:MAX_FILENAME_LENGTH],
        content_type="application/pdf",
        size_bytes=len(data),
        blob_name=blob_name,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("/documents/{document_id}/download")
def download_document(
    document_id: int, current_user: CurrentUser, db: DbDep, storage: StorageDep
) -> Response:
    document = get_owned_or_404(
        db, JobDocument, current_user.id, document_id, detail="Document not found"
    )
    try:
        data = storage.download(document.blob_name)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stored file is missing") from None
    return Response(
        content=data,
        media_type=document.content_type,
        headers={"Content-Disposition": _content_disposition(document.filename)},
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int, current_user: CurrentUser, db: DbDep, storage: StorageDep
) -> None:
    document = get_owned_or_404(
        db, JobDocument, current_user.id, document_id, detail="Document not found"
    )
    storage.delete(document.blob_name)
    db.delete(document)
    db.commit()
