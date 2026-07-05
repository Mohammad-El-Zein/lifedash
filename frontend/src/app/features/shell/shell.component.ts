import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { AvatarService } from '../../core/auth/avatar.service';
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
          <a
            routerLink="/profile"
            class="flex items-center gap-3 rounded-lg p-1.5 -m-1.5 mb-1.5 hover:bg-slate-800/70 transition-colors"
            title="Edit your profile"
          >
            @if (avatar.url(); as url) {
              <img [src]="url" alt="" class="h-10 w-10 rounded-full object-cover border border-slate-700 shrink-0" />
            } @else {
              <span class="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-semibold text-slate-400 shrink-0">
                {{ initials() }}
              </span>
            }
            <span class="min-w-0">
              <span class="block text-sm font-medium truncate">{{ displayName() }}</span>
              <span class="block text-xs text-slate-500 truncate">
                {{ user()?.job_title || user()?.email }}
              </span>
            </span>
          </a>
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
  readonly avatar = inject(AvatarService);

  readonly user = this.store.user;
  readonly displayName = computed(() => this.store.user()?.full_name || 'Welcome');

  ngOnInit(): void {
    this.avatar.refresh();
  }

  initials(): string {
    const name = this.user()?.full_name || this.user()?.email || '?';
    return name
      .split(/[\s@]+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
  readonly modules = computed(() => {
    const enabled = this.store.user()?.enabled_modules;
    return enabled ? MODULES.filter((m) => enabled.includes(m.key)) : MODULES;
  });

  logout(): void {
    this.store.clear();
    void this.router.navigate(['/login']);
  }
}
