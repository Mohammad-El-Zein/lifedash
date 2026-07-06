import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from '../auth/auth.store';
import { User } from '../models';
import { ThemeService } from './theme.service';

const USER: User = {
  id: 1,
  email: 'a@b.c',
  full_name: null,
  job_title: null,
  bio: null,
  language: null,
  theme: null,
  has_avatar: false,
  role: 'user',
  enabled_modules: [],
};

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });

  afterEach(() => localStorage.clear());

  it('defaults to dark and applies the .dark class', () => {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.theme()).toBe('dark');
    expect(service.effective()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('prefers the stored device theme when logged out', () => {
    localStorage.setItem('lifedash_theme', 'light');
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('cycles dark -> light -> system -> dark', () => {
    const service = TestBed.inject(ThemeService);
    service.cycle();
    expect(service.theme()).toBe('light');
    service.cycle();
    expect(service.theme()).toBe('system');
    service.cycle();
    expect(service.theme()).toBe('dark');
  });

  it('persists a change to the profile when authenticated', () => {
    localStorage.setItem('lifedash_token', 't');
    const store = TestBed.inject(AuthStore);
    const service = TestBed.inject(ThemeService);
    const http = TestBed.inject(HttpTestingController);

    service.set('light');
    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ theme: 'light' });
    req.flush({ ...USER, theme: 'light' });
    TestBed.tick();

    expect(store.user()?.theme).toBe('light');
    expect(localStorage.getItem('lifedash_theme')).toBe('light');
    http.verify();
  });

  it('adopts the profile theme when a user logs in', () => {
    const store = TestBed.inject(AuthStore);
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');

    store.setSession({ access_token: 't', token_type: 'bearer', user: { ...USER, theme: 'light' } });
    TestBed.tick();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
