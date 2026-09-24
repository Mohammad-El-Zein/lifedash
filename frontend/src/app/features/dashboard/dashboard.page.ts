import { afterNextRender, Component, computed, ElementRef, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStore } from '../../core/auth/auth.store';
import { MODULES } from '../../core/models';
import { staggerIn } from '../../shared/animations';
import { LifeInsightsComponent } from './life-insights.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, TranslatePipe, LucideAngularModule, LifeInsightsComponent],
  template: `
    <header class="mb-6 sm:mb-8">
      <h1 class="text-2xl sm:text-3xl font-bold">{{ greetingKey() | translate }}{{ greetingSuffix() }}</h1>
      <p class="text-ink-muted mt-1 text-sm sm:text-base">{{ 'dashboard.pickModule' | translate }}</p>
    </header>

    <app-life-insights />

    <!--
      A phone stacks the tiles in one column, so the desktop card shape would
      make the page several screens long. Below sm the same tile becomes a row:
      icon on the left, title and description beside it.
    -->
    <div class="grid gap-3 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
      @for (mod of modules(); track mod.key) {
        @if (mod.route) {
          <a
            data-tile
            [routerLink]="mod.route"
            class="group flex items-center gap-4 rounded-card border border-edge bg-card p-4 hover:border-accent/60 hover:bg-card transition-all hover:-translate-y-0.5 shadow-card sm:block sm:p-6"
          >
            <div class="icon-chip shrink-0 sm:mb-3"><lucide-icon [name]="mod.icon" [size]="22" /></div>
            <div class="min-w-0">
              <h2 class="font-semibold text-lg group-hover:text-link transition-colors">
                {{ mod.labelKey | translate }}
              </h2>
              <p class="text-sm text-ink-muted mt-0.5 sm:mt-1">{{ mod.descriptionKey | translate }}</p>
            </div>
          </a>
        } @else {
          <div
            data-tile
            class="relative flex items-center gap-4 rounded-card border border-edge-soft bg-card-dim p-4 opacity-70 sm:block sm:p-6"
          >
            <!-- In the row layout the badge trails the text; on a card it pins to the corner. -->
            <span
              class="order-last shrink-0 text-[10px] uppercase tracking-wide bg-field text-ink-muted rounded px-1.5 py-0.5 sm:absolute sm:top-4 sm:right-4 sm:order-none"
            >
              {{ 'common.comingSoon' | translate }}
            </span>
            <div class="icon-chip dim shrink-0 sm:mb-3"><lucide-icon [name]="mod.icon" [size]="22" /></div>
            <div class="min-w-0 flex-1">
              <h2 class="font-semibold text-lg text-ink-muted">{{ mod.labelKey | translate }}</h2>
              <p class="text-sm text-ink-faint mt-0.5 sm:mt-1">{{ mod.descriptionKey | translate }}</p>
            </div>
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
