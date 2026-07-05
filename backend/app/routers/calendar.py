from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep
from app.models.calendar import CalendarEvent, CalendarEventException
from app.schemas.calendar import (
    EventCreate,
    EventOut,
    EventUpdate,
    ExceptionCreate,
    ExceptionOut,
    WeekResponse,
)
from app.services.calendar import expand_week

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _get_event(db: DbDep, user_id: int, event_id: int) -> CalendarEvent:
    event = db.scalar(
        select(CalendarEvent)
        .options(selectinload(CalendarEvent.exceptions))
        .where(CalendarEvent.id == event_id, CalendarEvent.user_id == user_id)
    )
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return event


@router.get("/events", response_model=list[EventOut])
def list_events(current_user: CurrentUser, db: DbDep) -> list[CalendarEvent]:
    return list(
        db.scalars(
            select(CalendarEvent)
            .options(selectinload(CalendarEvent.exceptions))
            .where(CalendarEvent.user_id == current_user.id)
            .order_by(CalendarEvent.start_date, CalendarEvent.start_time)
        )
    )


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, current_user: CurrentUser, db: DbDep) -> CalendarEvent:
    event = CalendarEvent(user_id=current_user.id, **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: int, current_user: CurrentUser, db: DbDep) -> CalendarEvent:
    return _get_event(db, current_user.id, event_id)


@router.put("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int, payload: EventUpdate, current_user: CurrentUser, db: DbDep
) -> CalendarEvent:
    event = _get_event(db, current_user.id, event_id)
    for field, value in payload.model_dump().items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: int, current_user: CurrentUser, db: DbDep) -> None:
    event = _get_event(db, current_user.id, event_id)
    db.delete(event)
    db.commit()


@router.post(
    "/events/{event_id}/exceptions",
    response_model=ExceptionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_exception(
    event_id: int, payload: ExceptionCreate, current_user: CurrentUser, db: DbDep
) -> CalendarEventException:
    event = _get_event(db, current_user.id, event_id)
    # Upsert: one exception per (event, original occurrence date).
    existing = next(
        (e for e in event.exceptions if e.original_date == payload.original_date), None
    )
    if existing is not None:
        db.delete(existing)
        db.flush()
    exc = CalendarEventException(
        user_id=current_user.id, event_id=event.id, **payload.model_dump()
    )
    db.add(exc)
    db.commit()
    db.refresh(exc)
    return exc


@router.delete("/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exception(exception_id: int, current_user: CurrentUser, db: DbDep) -> None:
    exc = db.scalar(
        select(CalendarEventException).where(
            CalendarEventException.id == exception_id,
            CalendarEventException.user_id == current_user.id,
        )
    )
    if exc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exception not found")
    db.delete(exc)
    db.commit()


@router.get("/week", response_model=WeekResponse)
def get_week(
    current_user: CurrentUser, db: DbDep, start: date | None = None
) -> WeekResponse:
    """Concrete occurrences for a week. `start` defaults to the current week's Monday
    and is normalised to a Monday if another weekday is passed."""
    today = date.today()
    anchor = start or today
    week_start = anchor - timedelta(days=anchor.weekday())
    events = list(
        db.scalars(
            select(CalendarEvent)
            .options(selectinload(CalendarEvent.exceptions))
            .where(CalendarEvent.user_id == current_user.id)
        )
    )
    return WeekResponse(
        week_start=week_start,
        week_end=week_start + timedelta(days=6),
        occurrences=expand_week(events, week_start),
    )
