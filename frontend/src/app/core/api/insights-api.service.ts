import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { InsightsResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class InsightsApiService {
  private readonly http = inject(HttpClient);

  /**
   * Today's insights. Cheap: the backend answers from its daily cache and only
   * pays for a generation on the first call of the day.
   */
  get(): Observable<InsightsResponse> {
    return this.http.get<InsightsResponse>('/api/insights');
  }

  /** Forces a regeneration — one API call, rate limited server-side. */
  refresh(): Observable<InsightsResponse> {
    return this.http.post<InsightsResponse>('/api/insights/refresh', {});
  }
}
