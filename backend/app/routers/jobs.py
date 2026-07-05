from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep, get_owned_or_404
from app.models.jobs import JobApplication, JobStatusHistory
from app.schemas.jobs import (
    STATUS_PATTERN,
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdate,
    StatusChange,
)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _get_application(db: DbDep, user_id: int, application_id: int) -> JobApplication:
    return get_owned_or_404(
        db,
        JobApplication,
        user_id,
        application_id,
        options=(selectinload(JobApplication.status_history),),
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
        .options(selectinload(JobApplication.status_history))
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
def delete_application(application_id: int, current_user: CurrentUser, db: DbDep) -> None:
    application = _get_application(db, current_user.id, application_id)
    db.delete(application)
    db.commit()
