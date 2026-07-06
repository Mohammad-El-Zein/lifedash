import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { extractError } from '../../core/http-error';
import { AuthFxComponent } from './auth-fx.component';

@Component({
  selector: 'app-register-page',
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
          <h2 class="text-xl font-semibold">{{ 'auth.createTitle' | translate }}</h2>

          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2">
              {{ error() }}
            </p>
          }

          <div>
            <label for="fullName" class="block text-sm text-ink-soft mb-1">{{ 'auth.name' | translate }}</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              [(ngModel)]="fullName"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-hover"
              [placeholder]="'auth.namePlaceholder' | translate"
            />
          </div>

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
              minlength="8"
              [(ngModel)]="password"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-hover"
              [placeholder]="'auth.passwordPlaceholder' | translate"
            />
          </div>

          <button
            type="submit"
            [disabled]="loading()"
            class="w-full rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2.5 font-medium transition-colors"
          >
            {{ (loading() ? 'auth.creating' : 'auth.createTitle') | translate }}
          </button>

          <p class="text-sm text-ink-muted text-center">
            {{ 'auth.alreadyRegistered' | translate }}
            <a routerLink="/login" class="text-link hover:underline">{{ 'auth.signInTitle' | translate }}</a>
          </p>
        </form>
      </div>
    </div>
  `,
})
export class RegisterPage {
  private readonly api = inject(AuthApiService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  fullName = '';
  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (!this.email || this.password.length < 8) {
      this.error.set(this.translate.instant('auth.registerInvalid'));
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.register(this.email, this.password, this.fullName || null).subscribe({
      next: (res) => {
        this.store.setSession(res);
        void this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, this.translate.instant('auth.registerFailed')));
      },
    });
  }
}
