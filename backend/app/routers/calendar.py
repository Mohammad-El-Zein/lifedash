from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
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
from app.services.calendar import expand_week, occurs_on

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
    # The schedule may have changed: drop exceptions whose original occurrence
    # no longer exists, otherwise their moved/cancelled state points at nothing
    # and moved occurrences silently disappear from the week view.
    for exc in list(event.exceptions):
        if not occurs_on(event, exc.original_date):
            event.exceptions.remove(exc)
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
    if not occurs_on(event, payload.original_date):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "original_date is not an occurrence of this event",
        )
    if (
        payload.kind == "moved"
        and payload.new_date is not None
        and payload.new_date != payload.original_date
        and occurs_on(event, payload.new_date)
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "new_date already has a regular occurrence of this event",
        )
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
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This occurrence was modified concurrently; please retry",
        ) from None
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
    week_end = week_start + timedelta(days=6)
    # Push the date window into SQL instead of loading the user's full history:
    # one-offs inside the week, recurring events whose active range overlaps the
    # week, and events with an occurrence moved INTO the week from outside it.
    moved_into_week = select(CalendarEventException.event_id).where(
        CalendarEventException.user_id == current_user.id,
        CalendarEventException.kind == "moved",
        CalendarEventException.new_date >= week_start,
        CalendarEventException.new_date <= week_end,
    )
    events = list(
        db.scalars(
            select(CalendarEvent)
            .options(selectinload(CalendarEvent.exceptions))
            .where(
                CalendarEvent.user_id == current_user.id,
                or_(
                    and_(
                        CalendarEvent.recurrence_days.is_(None),
                        CalendarEvent.start_date >= week_start,
                        CalendarEvent.start_date <= week_end,
                    ),
                    and_(
                        CalendarEvent.recurrence_days.is_not(None),
                        CalendarEvent.start_date <= week_end,
                        or_(
                            CalendarEvent.end_date.is_(None),
                            CalendarEvent.end_date >= week_start,
                        ),
                    ),
                    CalendarEvent.id.in_(moved_into_week),
                ),
            )
        )
    )
    return WeekResponse(
        week_start=week_start,
        week_end=week_end,
        occurrences=expand_week(events, week_start),
    )
