import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TokenResponse, User } from '../models';

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
}
