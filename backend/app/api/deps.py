from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.base import Base
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


DbDep = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def get_owned_or_404[ModelT: Base](
    db: Session,
    model: type[ModelT],
    user_id: int,
    obj_id: int,
    *,
    options: tuple = (),
    detail: str | None = None,
) -> ModelT:
    """Fetch a row by id scoped to its owner, or 404. The single place the
    tenancy predicate lives — routers must not hand-roll this check."""
    query = select(model).where(model.id == obj_id, model.user_id == user_id)
    if options:
        query = query.options(*options)
    obj = db.scalar(query)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail or f"{model.__name__} not found")
    return obj


def commit_or_409(db: Session, detail: str) -> None:
    """Commit, translating a unique-constraint race into a clean 409 (and
    rolling the session back so it stays usable)."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail) from None
