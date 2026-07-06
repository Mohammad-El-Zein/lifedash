import { afterNextRender, Component, computed, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStore } from '../../core/auth/auth.store';
import { MODULES } from '../../core/models';
import { staggerIn } from '../../shared/animations';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, TranslatePipe],
  template: `
    <header class="mb-8">
      <h1 class="text-3xl font-bold">{{ greetingKey() | translate }}{{ greetingSuffix() }}</h1>
      <p class="text-ink-muted mt-1">{{ 'dashboard.pickModule' | translate }}</p>
    </header>

    <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      @for (mod of modules(); track mod.key) {
        @if (mod.route) {
          <a
            data-tile
            [routerLink]="mod.route"
            class="group rounded-card border border-edge bg-card p-6 hover:border-accent/60 hover:bg-card transition-all hover:-translate-y-0.5 shadow-card"
          >
            <div class="text-3xl mb-3">{{ mod.icon }}</div>
            <h2 class="font-semibold text-lg group-hover:text-link transition-colors">
              {{ mod.labelKey | translate }}
            </h2>
            <p class="text-sm text-ink-muted mt-1">{{ mod.descriptionKey | translate }}</p>
          </a>
        } @else {
          <div
            data-tile
            class="relative rounded-card border border-edge-soft bg-card-dim p-6 opacity-70"
          >
            <span
              class="absolute top-4 right-4 text-[10px] uppercase tracking-wide bg-field text-ink-muted rounded px-1.5 py-0.5"
            >
              {{ 'common.comingSoon' | translate }}
            </span>
            <div class="text-3xl mb-3 grayscale opacity-60">{{ mod.icon }}</div>
            <h2 class="font-semibold text-lg text-ink-muted">{{ mod.labelKey | translate }}</h2>
            <p class="text-sm text-ink-faint mt-1">{{ mod.descriptionKey | translate }}</p>
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

  readonly greetingKey = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'dashboard.morning' : hour < 18 ? 'dashboard.afternoon' : 'dashboard.evening';
  });

  readonly greetingSuffix = computed(() => {
    const name = this.store.user()?.full_name;
    return name ? `, ${name.split(' ')[0]}!` : '!';
  });
}
