import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ProfilePayload, TokenResponse, User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  register(email: string, password: string, fullName: string | null): Observable<TokenResponse> {
    return this.http.post<TokenResponse>('/api/auth/register', {
      email,
      password,
      full_name: fullName,
    });
  }

  login(email: string, password: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>('/api/auth/login', { email, password });
  }

  me(): Observable<User> {
    return this.http.get<User>('/api/users/me');
  }

  updateProfile(payload: ProfilePayload): Observable<User> {
    return this.http.patch<User>('/api/users/me', payload);
  }

  uploadAvatar(file: File): Observable<User> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<User>('/api/users/me/avatar', form);
  }

  avatarBlob(): Observable<Blob> {
    return this.http.get('/api/users/me/avatar', { responseType: 'blob' });
  }

  deleteAvatar(): Observable<User> {
    return this.http.delete<User>('/api/users/me/avatar');
  }
}
