import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';
import { InsightsApiService } from '../../core/api/insights-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { extractError } from '../../core/http-error';
import { Insight, InsightsResponse, MODULES } from '../../core/models';

const TONE_CLASS: Record<Insight['tone'], string> = {
  positive: 'border-success-edge bg-success-surface',
  warning: 'border-warn-edge bg-warn-surface',
  neutral: 'border-edge bg-card',
};

/**
 * The Life Insights row at the top of the dashboard.
 *
 * Loading it does *not* imply an API call: the backend serves a cached set and
 * only regenerates on the first visit of a day, or when the refresh button is
 * pressed. When the server has no Anthropic key the response says so and this
 * component renders nothing at all.
 */
@Component({
  selector: 'app-life-insights',
  imports: [TranslatePipe, LucideAngularModule],
  template: `
    @if (visible()) {
      <section class="mb-8">
        <div class="mb-3 flex items-center gap-2">
          <lucide-icon name="sparkles" [size]="18" class="text-link" />
          <h2 class="font-semibold">{{ 'insights.title' | translate }}</h2>
          @if (generatedLabel(); as label) {
            <span class="text-xs text-ink-faint">{{ label }}</span>
          }
          <span class="flex-1"></span>
          <button
            type="button"
            (click)="refresh()"
            [disabled]="loading()"
            class="flex items-center gap-1.5 rounded-control border border-edge-strong px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-field disabled:opacity-50"
            [title]="'insights.refreshHint' | translate"
          >
            <lucide-icon name="refresh-cw" [size]="14" [class.animate-spin]="loading()" />
            {{ 'insights.refresh' | translate }}
          </button>
        </div>

        @if (error(); as message) {
          <p class="rounded-card border border-danger-edge bg-danger-surface px-4 py-3 text-sm text-danger">
            {{ message }}
          </p>
        } @else if (loading() && insights().length === 0) {
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            @for (placeholder of [1, 2, 3]; track placeholder) {
              <div class="h-28 animate-pulse rounded-card border border-edge bg-card-dim"></div>
            }
          </div>
        } @else if (insights().length === 0) {
          <p class="rounded-card border border-edge bg-card px-4 py-3 text-sm text-ink-muted">
            {{ 'insights.empty' | translate }}
          </p>
        } @else {
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            @for (insight of insights(); track insight.title) {
              <article class="rounded-card border p-5 shadow-card" [class]="toneClass(insight)">
                <div class="mb-2 flex items-center gap-1.5">
                  @for (icon of iconsFor(insight); track icon) {
                    <lucide-icon [name]="icon" [size]="14" class="text-ink-muted" />
                  }
                </div>
                <h3 class="font-medium">{{ insight.title }}</h3>
                <p class="mt-1 text-sm text-ink-soft">{{ insight.body }}</p>
              </article>
            }
          </div>
        }
      </section>
    }
  `,
})
export class LifeInsightsComponent {
  private readonly api = inject(InsightsApiService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly response = signal<InsightsResponse | null>(null);

  readonly insights = computed(() => this.response()?.insights ?? []);
  /** Hidden entirely while the server reports AI features as unconfigured. */
  readonly visible = computed(() => this.response()?.available !== false);

  readonly generatedLabel = computed(() => {
    const generated = this.response()?.generated_at;
    if (!generated) return null;
    return new Date(generated).toLocaleString(this.language.locale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  ngOnInit(): void {
    this.load(this.api.get());
  }

  refresh(): void {
    this.load(this.api.refresh());
  }

  toneClass(insight: Insight): string {
    return TONE_CLASS[insight.tone] ?? TONE_CLASS.neutral;
  }

  iconsFor(insight: Insight): string[] {
    return insight.modules
      .map((key) => MODULES.find((module) => module.key === key)?.icon)
      .filter((icon): icon is string => Boolean(icon));
  }

  private load(request: ReturnType<InsightsApiService['get']>): void {
    this.loading.set(true);
    this.error.set(null);
    request.subscribe({
      next: (response) => {
        this.response.set(response);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, this.translate.instant('insights.errors.load')));
      },
    });
  }
}
