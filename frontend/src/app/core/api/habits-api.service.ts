import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Habit, HabitPayload } from '../models';

@Injectable({ providedIn: 'root' })
export class HabitsApiService {
  private readonly http = inject(HttpClient);

  list(week: string, includeArchived: boolean): Observable<Habit[]> {
    let params = new HttpParams().set('week', week);
    if (includeArchived) params = params.set('include_archived', 'true');
    return this.http.get<Habit[]>('/api/habits', { params });
  }

  create(payload: HabitPayload): Observable<Habit> {
    return this.http.post<Habit>('/api/habits', payload);
  }

  update(id: number, payload: HabitPayload & { is_archived: boolean }): Observable<Habit> {
    return this.http.put<Habit>(`/api/habits/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/habits/${id}`);
  }

  toggle(id: number, date: string): Observable<{ date: string; done: boolean }> {
    return this.http.post<{ date: string; done: boolean }>(`/api/habits/${id}/toggle`, { date });
  }
}
