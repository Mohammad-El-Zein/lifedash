import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { extractError } from '../../core/http-error';

@Component({
  selector: 'app-register-page',
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold tracking-tight">
            Life<span class="text-indigo-600 dark:text-indigo-400">Dash</span>
          </h1>
          <p class="text-slate-600 dark:text-slate-400 mt-2">{{ 'app.tagline' | translate }}</p>
        </div>

        <form
          class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl space-y-5"
          (ngSubmit)="submit()"
        >
          <h2 class="text-xl font-semibold">{{ 'auth.createTitle' | translate }}</h2>

          @if (error()) {
            <p class="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
              {{ error() }}
            </p>
          }

          <div>
            <label for="fullName" class="block text-sm text-slate-700 dark:text-slate-300 mb-1">{{ 'auth.name' | translate }}</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              [(ngModel)]="fullName"
              class="w-full rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              [placeholder]="'auth.namePlaceholder' | translate"
            />
          </div>

          <div>
            <label for="email" class="block text-sm text-slate-700 dark:text-slate-300 mb-1">{{ 'auth.email' | translate }}</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              [(ngModel)]="email"
              class="w-full rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm text-slate-700 dark:text-slate-300 mb-1">{{ 'auth.password' | translate }}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minlength="8"
              [(ngModel)]="password"
              class="w-full rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              [placeholder]="'auth.passwordPlaceholder' | translate"
            />
          </div>

          <button
            type="submit"
            [disabled]="loading()"
            class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 font-medium transition-colors"
          >
            {{ (loading() ? 'auth.creating' : 'auth.createTitle') | translate }}
          </button>

          <p class="text-sm text-slate-600 dark:text-slate-400 text-center">
            {{ 'auth.alreadyRegistered' | translate }}
            <a routerLink="/login" class="text-indigo-600 dark:text-indigo-400 hover:underline">{{ 'auth.signInTitle' | translate }}</a>
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
