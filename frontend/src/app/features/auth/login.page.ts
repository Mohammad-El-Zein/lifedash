import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth.store';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold tracking-tight">
            Life<span class="text-indigo-400">Dash</span>
          </h1>
          <p class="text-slate-400 mt-2">Your whole life, one dashboard.</p>
        </div>

        <form
          class="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-5"
          (ngSubmit)="submit()"
        >
          <h2 class="text-xl font-semibold">Sign in</h2>

          @if (error()) {
            <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
              {{ error() }}
            </p>
          }

          <div>
            <label for="email" class="block text-sm text-slate-300 mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              [(ngModel)]="email"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="block text-sm text-slate-300 mb-1">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              [(ngModel)]="password"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            [disabled]="loading()"
            class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 font-medium transition-colors"
          >
            {{ loading() ? 'Signing in…' : 'Sign in' }}
          </button>

          <p class="text-sm text-slate-400 text-center">
            No account yet?
            <a routerLink="/register" class="text-indigo-400 hover:underline">Create one</a>
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
        this.error.set(err?.error?.detail ?? 'Login failed. Please try again.');
      },
    });
  }
}
