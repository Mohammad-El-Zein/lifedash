import { Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStore } from '../../core/auth/auth.store';
import { AvatarService } from '../../core/auth/avatar.service';
import { LanguageService } from '../../core/i18n/language.service';
import { MODULES } from '../../core/models';
import { pageEnter } from '../../shared/animations';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
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
            <span>🏠</span> {{ 'nav.overview' | translate }}
          </a>

          @for (mod of modules(); track mod.key) {
            @if (mod.route) {
              <a
                [routerLink]="mod.route"
                routerLinkActive="bg-slate-800 text-white"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800/70 transition-colors"
              >
                <span>{{ mod.icon }}</span> {{ mod.labelKey | translate }}
              </a>
            } @else {
              <div
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-500 cursor-not-allowed"
                [title]="(mod.labelKey | translate) + ' — ' + ('common.comingSoon' | translate)"
              >
                <span class="grayscale opacity-60">{{ mod.icon }}</span>
                <span class="flex-1">{{ mod.labelKey | translate }}</span>
                <span class="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
                  {{ 'common.soon' | translate }}
                </span>
              </div>
            }
          }
        </nav>

        <div class="border-t border-slate-800 p-4">
          <a
            routerLink="/profile"
            class="flex items-center gap-3 rounded-lg p-1.5 -m-1.5 mb-1.5 hover:bg-slate-800/70 transition-colors"
            [title]="'nav.editProfile' | translate"
          >
            @if (avatar.url(); as url) {
              <img [src]="url" alt="" class="h-10 w-10 rounded-full object-cover border border-slate-700 shrink-0" />
            } @else {
              <span class="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-semibold text-slate-400 shrink-0">
                {{ initials() }}
              </span>
            }
            <span class="min-w-0">
              <span class="block text-sm font-medium truncate">
                {{ user()?.full_name || ('nav.welcome' | translate) }}
              </span>
              <span class="block text-xs text-slate-500 truncate">
                {{ user()?.job_title || user()?.email }}
              </span>
            </span>
          </a>
          <div class="mt-3 flex gap-2">
            <button
              (click)="logout()"
              class="flex-1 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {{ 'nav.signOut' | translate }}
            </button>
            <button
              (click)="language.toggle()"
              class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors uppercase tracking-wide"
              [title]="'languages.switch' | translate"
            >
              {{ language.lang() === 'en' ? 'DE' : 'EN' }}
            </button>
          </div>
        </div>
      </aside>

      <!-- Content -->
      <main class="flex-1 min-w-0 p-6 lg:p-10">
        <div #content>
          <router-outlet (activate)="onRouteActivate()" />
        </div>
      </main>
    </div>
  `,
})
export class ShellComponent {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  readonly avatar = inject(AvatarService);
  readonly language = inject(LanguageService);

  onRouteActivate(): void {
    pageEnter(this.content().nativeElement);
  }

  readonly user = this.store.user;

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
