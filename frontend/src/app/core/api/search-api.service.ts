import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SearchResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class SearchApiService {
  private readonly http = inject(HttpClient);

  /** Cross-module substring search. Plain SQL on the backend — no AI call. */
  search(query: string): Observable<SearchResponse> {
    return this.http.get<SearchResponse>('/api/search', {
      params: new HttpParams().set('q', query),
    });
  }
}
