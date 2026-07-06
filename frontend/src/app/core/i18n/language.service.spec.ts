import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from '../auth/auth.store';
import { User } from '../models';
import { LanguageService } from './language.service';

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

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ fallbackLang: 'en' }),
      ],
    });
  });

  afterEach(() => localStorage.clear());

  it('falls back to English when neither profile nor storage has a language', () => {
    const service = TestBed.inject(LanguageService);
    expect(service.lang()).toBe('en');
    expect(service.locale()).toBe('en-GB');
  });

  it('prefers the stored device language when logged out', () => {
    localStorage.setItem('lifedash_lang', 'de');
    const service = TestBed.inject(LanguageService);
    expect(service.lang()).toBe('de');
    expect(service.locale()).toBe('de-DE');
  });

  it('persists a change to the profile when authenticated', () => {
    localStorage.setItem('lifedash_token', 't');
    const store = TestBed.inject(AuthStore);
    const service = TestBed.inject(LanguageService);
    const http = TestBed.inject(HttpTestingController);

    service.set('de');
    const req = http.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ language: 'de' });
    req.flush({ ...USER, language: 'de' });
    TestBed.tick(); // flush the effect that mirrors the language to localStorage

    expect(service.lang()).toBe('de');
    expect(store.user()?.language).toBe('de');
    expect(localStorage.getItem('lifedash_lang')).toBe('de');
    http.verify();
  });

  it('adopts the profile language when a user logs in', async () => {
    const store = TestBed.inject(AuthStore);
    const service = TestBed.inject(LanguageService);
    expect(service.lang()).toBe('en');

    store.setSession({ access_token: 't', token_type: 'bearer', user: { ...USER, language: 'de' } });
    TestBed.tick(); // flush the effect that adopts the profile language
    expect(service.lang()).toBe('de');
  });
});
