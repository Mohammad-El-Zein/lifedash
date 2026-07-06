from uuid import uuid4

from fastapi import APIRouter, HTTPException, Response, UploadFile, status

from app.api.deps import CurrentUser, DbDep
from app.core.config import ALL_MODULES
from app.schemas.auth import UserOut, UserUpdate
from app.services.storage import AvatarStorageDep

router = APIRouter(prefix="/api/users", tags=["users"])

MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB

# content type -> (magic-byte check, file extension)
AVATAR_TYPES = {
    "image/jpeg": (lambda d: d.startswith(b"\xff\xd8\xff"), "jpg"),
    "image/png": (lambda d: d.startswith(b"\x89PNG\r\n\x1a\n"), "png"),
    "image/webp": (lambda d: d[:4] == b"RIFF" and d[8:12] == b"WEBP", "webp"),
}
EXTENSION_MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@router.get("/me", response_model=UserOut)
def read_me(current_user: CurrentUser) -> UserOut:
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, current_user: CurrentUser, db: DbDep) -> UserOut:
    provided = payload.model_fields_set
    if "full_name" in provided:
        current_user.full_name = payload.full_name
    if "job_title" in provided:
        current_user.job_title = payload.job_title
    if "bio" in provided:
        current_user.bio = payload.bio
    if "language" in provided:
        current_user.language = payload.language
    if "theme" in provided:
        current_user.theme = payload.theme
    if payload.enabled_modules is not None:
        unknown = set(payload.enabled_modules) - set(ALL_MODULES)
        if unknown:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown modules: {sorted(unknown)}"
            )
        current_user.enabled_modules = payload.enabled_modules
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile, current_user: CurrentUser, db: DbDep, storage: AvatarStorageDep
) -> UserOut:
    spec = AVATAR_TYPES.get(file.content_type or "")
    if spec is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Only JPEG, PNG or WebP images are allowed"
        )
    is_valid, extension = spec
    data = await file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image exceeds 2 MB")
    if not is_valid(data):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "File content does not match the image type"
        )

    if current_user.avatar_blob_name:
        storage.delete(current_user.avatar_blob_name)
    blob_name = f"user-{current_user.id}/{uuid4().hex}.{extension}"
    storage.upload(blob_name, data, file.content_type or "application/octet-stream")
    current_user.avatar_blob_name = blob_name
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me/avatar")
def get_avatar(current_user: CurrentUser, storage: AvatarStorageDep) -> Response:
    if not current_user.avatar_blob_name:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No avatar set")
    try:
        data = storage.download(current_user.avatar_blob_name)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stored avatar is missing") from None
    extension = current_user.avatar_blob_name.rsplit(".", 1)[-1]
    return Response(
        content=data,
        media_type=EXTENSION_MEDIA_TYPES.get(extension, "application/octet-stream"),
        headers={"Cache-Control": "no-cache"},
    )


@router.delete("/me/avatar", response_model=UserOut)
def delete_avatar(current_user: CurrentUser, db: DbDep, storage: AvatarStorageDep) -> UserOut:
    if current_user.avatar_blob_name:
        storage.delete(current_user.avatar_blob_name)
        current_user.avatar_blob_name = None
        db.add(current_user)
        db.commit()
        db.refresh(current_user)
    return current_user
