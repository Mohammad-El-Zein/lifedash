import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthApiService } from '../api/auth-api.service';
import { AuthStore } from '../auth/auth.store';

export type AppTheme = 'dark' | 'light' | 'system';

const THEME_KEY = 'lifedash_theme';
const THEMES: readonly AppTheme[] = ['dark', 'light', 'system'];

function isTheme(value: string | null | undefined): value is AppTheme {
  return THEMES.includes(value as AppTheme);
}

/** Profile choice wins, then the last choice on this device, else dark (the app's default look). */
function detectInitial(userTheme: string | null | undefined): AppTheme {
  if (isTheme(userTheme)) return userTheme;
  const stored = localStorage.getItem(THEME_KEY);
  return isTheme(stored) ? stored : 'dark';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly store = inject(AuthStore);
  private readonly api = inject(AuthApiService);

  private readonly _theme = signal<AppTheme>(detectInitial(this.store.user()?.theme));
  readonly theme = this._theme.asReadonly();

  private readonly systemDark = signal(window.matchMedia('(prefers-color-scheme: dark)').matches);
  /** What is actually rendered: resolves "system" to dark or light. */
  readonly effective = computed<'dark' | 'light'>(() => {
    const theme = this._theme();
    return theme === 'system' ? (this.systemDark() ? 'dark' : 'light') : theme;
  });

  /** The user object's theme as of the previous change; guards against
   *  re-adopting a stale profile value right after a local toggle. */
  private lastUserTheme = this.store.user()?.theme;

  constructor() {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => this.systemDark.set(e.matches));

    effect(() => {
      const userTheme = this.store.user()?.theme;
      if (userTheme !== this.lastUserTheme && isTheme(userTheme)) {
        this._theme.set(userTheme); // profile loaded on login wins
      }
      this.lastUserTheme = userTheme;
    });
    effect(() => {
      document.documentElement.classList.toggle('dark', this.effective() === 'dark');
      localStorage.setItem(THEME_KEY, this._theme());
    });
  }

  set(theme: AppTheme): void {
    if (theme === this._theme()) return;
    this._theme.set(theme);
    if (this.store.isAuthenticated()) {
      this.api.updateProfile({ theme }).subscribe({
        next: (user) => this.store.updateUser(user),
        error: () => {}, // keep the UI theme even if persisting fails
      });
    }
  }

  /** Sidebar quick-toggle: dark → light → system → dark. */
  cycle(): void {
    const order: AppTheme[] = ['dark', 'light', 'system'];
    this.set(order[(order.indexOf(this._theme()) + 1) % order.length]);
  }
}
