import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CalendarEvent, CalendarException, EventPayload, WeekResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  private readonly http = inject(HttpClient);

  getWeek(start?: string): Observable<WeekResponse> {
    let params = new HttpParams();
    if (start) params = params.set('start', start);
    return this.http.get<WeekResponse>('/api/calendar/week', { params });
  }

  listEvents(): Observable<CalendarEvent[]> {
    return this.http.get<CalendarEvent[]>('/api/calendar/events');
  }

  getEvent(id: number): Observable<CalendarEvent> {
    return this.http.get<CalendarEvent>(`/api/calendar/events/${id}`);
  }

  createEvent(payload: EventPayload): Observable<CalendarEvent> {
    return this.http.post<CalendarEvent>('/api/calendar/events', payload);
  }

  updateEvent(id: number, payload: EventPayload): Observable<CalendarEvent> {
    return this.http.put<CalendarEvent>(`/api/calendar/events/${id}`, payload);
  }

  deleteEvent(id: number): Observable<void> {
    return this.http.delete<void>(`/api/calendar/events/${id}`);
  }

  createException(
    eventId: number,
    payload: Omit<CalendarException, 'id' | 'event_id'>,
  ): Observable<CalendarException> {
    return this.http.post<CalendarException>(
      `/api/calendar/events/${eventId}/exceptions`,
      payload,
    );
  }

  deleteException(id: number): Observable<void> {
    return this.http.delete<void>(`/api/calendar/exceptions/${id}`);
  }
}
