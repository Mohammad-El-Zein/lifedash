import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Meal, MealPayload } from '../models';

@Injectable({ providedIn: 'root' })
export class MealsApiService {
  private readonly http = inject(HttpClient);

  list(date: string): Observable<Meal[]> {
    return this.http.get<Meal[]>('/api/meals', { params: new HttpParams().set('date', date) });
  }

  create(payload: MealPayload): Observable<Meal> {
    return this.http.post<Meal>('/api/meals', payload);
  }

  update(id: number, payload: MealPayload): Observable<Meal> {
    return this.http.put<Meal>(`/api/meals/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/meals/${id}`);
  }
}
