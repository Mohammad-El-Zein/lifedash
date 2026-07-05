from datetime import date, timedelta

from app.models.calendar import CalendarEvent, CalendarEventException
from app.schemas.calendar import Occurrence


def _occurs_on(event: CalendarEvent, day: date) -> bool:
    if event.recurrence_days is None:
        return event.start_date == day
    if day < event.start_date:
        return False
    if event.end_date is not None and day > event.end_date:
        return False
    return day.weekday() in event.recurrence_days


def expand_week(events: list[CalendarEvent], week_start: date) -> list[Occurrence]:
    """Expand events into concrete occurrences for the 7 days starting at week_start,
    applying per-day exceptions (cancelled occurrences are dropped, moved occurrences
    appear at their new date/time — even if the original date lies outside the week)."""
    week_end = week_start + timedelta(days=6)
    days = [week_start + timedelta(days=i) for i in range(7)]
    occurrences: list[Occurrence] = []

    for event in events:
        exceptions: dict[date, CalendarEventException] = {
            exc.original_date: exc for exc in event.exceptions
        }
        for day in days:
            if not _occurs_on(event, day):
                continue
            if day in exceptions:  # cancelled or moved away from this day
                continue
            occurrences.append(
                Occurrence(
                    event_id=event.id,
                    title=event.title,
                    description=event.description,
                    location=event.location,
                    color=event.color,
                    date=day,
                    start_time=event.start_time,
                    end_time=event.end_time,
                    is_recurring=event.recurrence_days is not None,
                )
            )
        # Moved occurrences landing inside this week.
        for exc in event.exceptions:
            if (
                exc.kind == "moved"
                and exc.new_date is not None
                and week_start <= exc.new_date <= week_end
                and _occurs_on(event, exc.original_date)
            ):
                occurrences.append(
                    Occurrence(
                        event_id=event.id,
                        exception_id=exc.id,
                        title=event.title,
                        description=event.description,
                        location=event.location,
                        color=event.color,
                        date=exc.new_date,
                        start_time=exc.new_start_time or event.start_time,
                        end_time=exc.new_end_time or event.end_time,
                        is_recurring=event.recurrence_days is not None,
                        is_moved=True,
                    )
                )

    occurrences.sort(key=lambda o: (o.date, o.start_time))
    return occurrences
