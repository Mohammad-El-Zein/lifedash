import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApplicationPayload, JobApplication, JobDocument, JobStatus } from '../models';

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

  uploadDocument(applicationId: number, file: File): Observable<JobDocument> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<JobDocument>(
      `/api/jobs/applications/${applicationId}/documents`,
      form,
    );
  }

  downloadDocument(documentId: number): Observable<Blob> {
    return this.http.get(`/api/jobs/documents/${documentId}/download`, {
      responseType: 'blob',
    });
  }

  deleteDocument(documentId: number): Observable<void> {
    return this.http.delete<void>(`/api/jobs/documents/${documentId}`);
  }
}
