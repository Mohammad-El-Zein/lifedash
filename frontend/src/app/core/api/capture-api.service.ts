import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CaptureSuggestion } from '../models';

@Injectable({ providedIn: 'root' })
export class CaptureApiService {
  private readonly http = inject(HttpClient);

  /**
   * Parses a short note into a suggested entry. Costs one (small) Anthropic
   * call, so it is only ever called on submit — never while typing — and the
   * backend rate limits it per user. Nothing is saved until the user confirms.
   */
  parse(text: string): Observable<CaptureSuggestion> {
    return this.http.post<CaptureSuggestion>('/api/capture/parse', { text });
  }
}
