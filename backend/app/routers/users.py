from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbDep
from app.core.config import ALL_MODULES
from app.schemas.auth import UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def read_me(current_user: CurrentUser) -> UserOut:
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, current_user: CurrentUser, db: DbDep) -> UserOut:
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
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
