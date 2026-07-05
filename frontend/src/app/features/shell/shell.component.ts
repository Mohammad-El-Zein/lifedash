import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { MODULES } from '../../core/models';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen flex">
      <!-- Sidebar -->
      <aside class="w-64 shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col">
        <a routerLink="/dashboard" class="px-6 py-5 text-2xl font-bold tracking-tight">
          Life<span class="text-indigo-400">Dash</span>
        </a>

        <nav class="flex-1 px-3 space-y-1">
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-slate-800 text-white"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/70 transition-colors"
          >
            <span>🏠</span> Overview
          </a>

          @for (mod of modules(); track mod.key) {
            @if (mod.route) {
              <a
                [routerLink]="mod.route"
                routerLinkActive="bg-slate-800 text-white"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/70 transition-colors"
              >
                <span>{{ mod.icon }}</span> {{ mod.label }}
              </a>
            } @else {
              <div
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 cursor-not-allowed"
                [title]="mod.label + ' — coming soon'"
              >
                <span class="grayscale opacity-60">{{ mod.icon }}</span>
                <span class="flex-1">{{ mod.label }}</span>
                <span class="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
                  soon
                </span>
              </div>
            }
          }
        </nav>

        <div class="border-t border-slate-800 p-4">
          <p class="text-sm font-medium truncate">{{ displayName() }}</p>
          <p class="text-xs text-slate-500 truncate">{{ user()?.email }}</p>
          <button
            (click)="logout()"
            class="mt-3 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <!-- Content -->
      <main class="flex-1 min-w-0 p-6 lg:p-10">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);

  readonly user = this.store.user;
  readonly displayName = computed(() => this.store.user()?.full_name || 'Welcome');
  readonly modules = computed(() => {
    const enabled = this.store.user()?.enabled_modules;
    return enabled ? MODULES.filter((m) => enabled.includes(m.key)) : MODULES;
  });

  logout(): void {
    this.store.clear();
    void this.router.navigate(['/login']);
  }
}
