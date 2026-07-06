import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { extractError } from '../../core/http-error';
import { AuthFxComponent } from './auth-fx.component';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, TranslatePipe, AuthFxComponent],
  template: `
    <div class="relative min-h-screen overflow-hidden flex items-center justify-center px-4">
      <app-auth-fx />
      <div class="relative z-10 w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold tracking-tight">
            Life<span class="text-link">Dash</span>
          </h1>
          <p class="text-ink-muted mt-2">{{ 'app.tagline' | translate }}</p>
        </div>

        <form
          class="bg-card border border-edge rounded-card p-8 shadow-modal space-y-5"
          (ngSubmit)="submit()"
        >
          <h2 class="text-xl font-semibold">{{ 'auth.signInTitle' | translate }}</h2>

          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2">
              {{ error() }}
            </p>
          }

          <div>
            <label for="email" class="block text-sm text-ink-soft mb-1">{{ 'auth.email' | translate }}</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              [(ngModel)]="email"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-hover"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm text-ink-soft mb-1">{{ 'auth.password' | translate }}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              [(ngModel)]="password"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-hover"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            [disabled]="loading()"
            class="w-full rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2.5 font-medium transition-colors"
          >
            {{ (loading() ? 'auth.signingIn' : 'auth.signInTitle') | translate }}
          </button>

          <p class="text-sm text-ink-muted text-center">
            {{ 'auth.noAccount' | translate }}
            <a routerLink="/register" class="text-link hover:underline">{{ 'auth.createOne' | translate }}</a>
          </p>
        </form>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly api = inject(AuthApiService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.login(this.email, this.password).subscribe({
      next: (res) => {
        this.store.setSession(res);
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, this.translate.instant('auth.loginFailed')));
      },
    });
  }
}
