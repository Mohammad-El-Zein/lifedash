import { afterNextRender, Component, computed, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { MODULES } from '../../core/models';
import { staggerIn } from '../../shared/animations';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  template: `
    <header class="mb-8">
      <h1 class="text-3xl font-bold">{{ greeting() }}</h1>
      <p class="text-slate-400 mt-1">Pick a module to get started.</p>
    </header>

    <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      @for (mod of modules(); track mod.key) {
        @if (mod.route) {
          <a
            data-tile
            [routerLink]="mod.route"
            class="group rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-indigo-500/60 hover:bg-slate-900/80 transition-all hover:-translate-y-0.5 shadow-lg"
          >
            <div class="text-3xl mb-3">{{ mod.icon }}</div>
            <h2 class="font-semibold text-lg group-hover:text-indigo-300 transition-colors">
              {{ mod.label }}
            </h2>
            <p class="text-sm text-slate-400 mt-1">{{ mod.description }}</p>
          </a>
        } @else {
          <div
            data-tile
            class="relative rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6 opacity-70"
          >
            <span
              class="absolute top-4 right-4 text-[10px] uppercase tracking-wide bg-slate-800 text-slate-400 rounded px-1.5 py-0.5"
            >
              Coming soon
            </span>
            <div class="text-3xl mb-3 grayscale opacity-60">{{ mod.icon }}</div>
            <h2 class="font-semibold text-lg text-slate-400">{{ mod.label }}</h2>
            <p class="text-sm text-slate-500 mt-1">{{ mod.description }}</p>
          </div>
        }
      }
    </div>
  `,
})
export class DashboardPage {
  private readonly store = inject(AuthStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      staggerIn(Array.from(this.host.nativeElement.querySelectorAll('[data-tile]')));
    });
  }

  readonly modules = computed(() => {
    const enabled = this.store.user()?.enabled_modules;
    return enabled ? MODULES.filter((m) => enabled.includes(m.key)) : MODULES;
  });

  readonly greeting = computed(() => {
    const name = this.store.user()?.full_name;
    const hour = new Date().getHours();
    const base = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return name ? `${base}, ${name.split(' ')[0]}!` : `${base}!`;
  });
}
