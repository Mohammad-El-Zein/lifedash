import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApplicationPayload, JobApplication, JobStatus } from '../models';

@Injectable({ providedIn: 'root' })
export class JobsApiService {
  private readonly http = inject(HttpClient);

  list(status?: JobStatus): Observable<JobApplication[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<JobApplication[]>('/api/jobs/applications', { params });
  }

  create(payload: ApplicationPayload & { status?: JobStatus }): Observable<JobApplication> {
    return this.http.post<JobApplication>('/api/jobs/applications', payload);
  }

  update(id: number, payload: ApplicationPayload): Observable<JobApplication> {
    return this.http.put<JobApplication>(`/api/jobs/applications/${id}`, payload);
  }

  changeStatus(id: number, status: JobStatus, note: string | null): Observable<JobApplication> {
    return this.http.post<JobApplication>(`/api/jobs/applications/${id}/status`, {
      status,
      note,
    });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/jobs/applications/${id}`);
  }
}
