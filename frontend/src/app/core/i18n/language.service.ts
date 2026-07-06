import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '../api/auth-api.service';
import { AuthStore } from '../auth/auth.store';

export type AppLanguage = 'en' | 'de';

const LANG_KEY = 'lifedash_lang';
const SUPPORTED: readonly AppLanguage[] = ['en', 'de'];

function isSupported(lang: string | null | undefined): lang is AppLanguage {
  return SUPPORTED.includes(lang as AppLanguage);
}

/** Logged out: last choice on this device, else browser language, else English. */
function detectInitial(userLang: string | null | undefined): AppLanguage {
  if (isSupported(userLang)) return userLang;
  const stored = localStorage.getItem(LANG_KEY);
  if (isSupported(stored)) return stored;
  for (const lang of navigator.languages ?? []) {
    const base = lang.slice(0, 2).toLowerCase();
    if (isSupported(base)) return base;
  }
  return 'en';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly store = inject(AuthStore);
  private readonly api = inject(AuthApiService);

  private readonly _lang = signal<AppLanguage>(detectInitial(this.store.user()?.language));
  readonly lang = this._lang.asReadonly();
  /** Locale for toLocaleDateString & friends, kept in sync with the UI language. */
  readonly locale = computed(() => (this._lang() === 'de' ? 'de-DE' : 'en-GB'));

  /** The user object's language as of the previous change; guards against
   *  re-adopting a stale profile value right after a local toggle. */
  private lastUserLang = this.store.user()?.language;

  constructor() {
    effect(() => {
      const userLang = this.store.user()?.language;
      if (userLang !== this.lastUserLang && isSupported(userLang)) {
        this._lang.set(userLang); // profile loaded on login wins
      }
      this.lastUserLang = userLang;
    });
    effect(() => {
      const lang = this._lang();
      this.translate.use(lang);
      localStorage.setItem(LANG_KEY, lang);
      document.documentElement.lang = lang;
    });
  }

  set(lang: AppLanguage): void {
    if (lang === this._lang()) return;
    this._lang.set(lang);
    if (this.store.isAuthenticated()) {
      this.api.updateProfile({ language: lang }).subscribe({
        next: (user) => this.store.updateUser(user),
        error: () => {}, // keep the UI language even if persisting fails
      });
    }
  }

  toggle(): void {
    this.set(this._lang() === 'en' ? 'de' : 'en');
  }
}
