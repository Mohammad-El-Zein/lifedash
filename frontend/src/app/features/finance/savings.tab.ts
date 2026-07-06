import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { eur } from '../../core/format';
import { extractError } from '../../core/http-error';
import { SavingsOverview } from '../../core/models';

@Component({
  selector: 'app-savings-tab',
  imports: [FormsModule, TranslatePipe],
  template: `
    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (overview(); as o) {
      @if (error()) {
        <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
          {{ error() }}
        </p>
      }

      <div class="grid gap-6 lg:grid-cols-3 mb-6">
        <!-- Cumulative progress -->
        <div class="rounded-card border border-edge bg-card p-5 lg:col-span-2">
          <h2 class="font-semibold mb-1">
            {{ 'savings.since' | translate: { month: o.start_month.slice(0, 7) } }}
          </h2>
          <p class="text-3xl font-semibold mt-2 tabular-nums">
            {{ eur(o.saved_total) }}
            <span class="text-ink-muted text-xl font-normal">/ {{ eur(o.target_total) }} {{ 'savings.saved' | translate }}</span>
          </p>
          <p class="mt-1 text-sm" [class]="o.delta_total >= 0 ? 'text-success' : 'text-danger'">
            {{ o.delta_total >= 0 ? '+' : '' }}{{ eur(o.delta_total) }} {{ 'savings.vsGoal' | translate }}
            ({{ o.months.length }} × {{ eur(o.monthly_target) }})
          </p>
          <div class="h-3 rounded-full bg-field overflow-hidden mt-4">
            <div
              class="h-full rounded-full"
              [class]="o.delta_total >= 0 ? 'bg-success' : 'bg-warn'"
              [style.width.%]="progressPct()"
            ></div>
          </div>
        </div>

        <!-- Settings -->
        <div class="rounded-card border border-edge bg-card p-5">
          <h2 class="font-semibold mb-4">{{ 'savings.settings' | translate }}</h2>
          <div class="space-y-3">
            <div>
              <label for="savTarget" class="block text-sm text-ink-soft mb-1">{{ 'savings.monthlyTarget' | translate }}</label>
              <input id="savTarget" name="savTarget" type="number" min="0" step="10"
                [(ngModel)]="pendingTarget"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="savStart" class="block text-sm text-ink-soft mb-1">{{ 'savings.trackingStarts' | translate }}</label>
              <input id="savStart" name="savStart" type="month" [(ngModel)]="pendingStart"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <button (click)="saveSettings()" [disabled]="saving()"
              class="w-full rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium">
              {{ (saving() ? 'common.saving' : 'savings.saveSettings') | translate }}
            </button>
            <p class="text-xs text-ink-faint">
              {{ 'savings.targetNote' | translate }}
            </p>
          </div>
        </div>
      </div>

      <!-- Per-month breakdown -->
      <div class="rounded-card border border-edge bg-card overflow-hidden">
        <h2 class="font-semibold px-5 pt-5 pb-3">{{ 'savings.monthByMonth' | translate }}</h2>
        @if (o.months.length === 0) {
          <p class="text-sm text-ink-faint px-5 pb-6">
            {{ 'savings.futureStart' | translate }}
          </p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-ink-muted border-t border-edge">
                  <th class="px-5 py-2.5 font-medium">{{ 'savings.month' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium text-right">{{ 'savings.income' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium text-right">{{ 'savings.expenses' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium text-right">{{ 'savings.savedCol' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium text-right">{{ 'savings.target' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium text-right">±</th>
                </tr>
              </thead>
              <tbody>
                @for (m of monthsNewestFirst(); track m.month) {
                  <tr class="border-t border-edge-soft hover:bg-row-hover">
                    <td class="px-5 py-2.5 text-ink-soft tabular-nums">
                      {{ m.month.slice(0, 7) }}
                      @if (m.is_current) {
                        <span class="ml-2 rounded-full bg-info-surface border border-info-edge text-info-ink px-2 py-0.5 text-xs">{{ 'savings.inProgress' | translate }}</span>
                      }
                    </td>
                    <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">{{ eur(m.income) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">{{ eur(m.expenses) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums font-medium">{{ eur(m.saved) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums text-ink-muted">{{ eur(m.target) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums font-medium"
                      [class]="m.delta >= 0 ? 'text-success' : 'text-danger'">
                      {{ m.delta >= 0 ? '+' : '' }}{{ eur(m.delta) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }
  `,
})
export class SavingsTab {
  private readonly api = inject(FinanceApiService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly overview = signal<SavingsOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  pendingTarget: number | null = null;
  pendingStart = '';

  readonly eur = eur;

  readonly progressPct = computed(() => {
    const o = this.overview();
    if (!o || o.target_total <= 0) return o && o.saved_total > 0 ? 100 : 0;
    return Math.min(Math.max((o.saved_total / o.target_total) * 100, 0), 100);
  });

  readonly monthsNewestFirst = computed(() => [...(this.overview()?.months ?? [])].reverse());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.savings().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.pendingTarget = overview.monthly_target;
        this.pendingStart = overview.start_month.slice(0, 7);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractError(err, this.translate.instant('savings.errors.load')));
      },
    });
  }

  saveSettings(): void {
    if (
      this.pendingTarget === null ||
      !Number.isFinite(this.pendingTarget) ||
      this.pendingTarget < 0 ||
      !this.pendingStart
    ) {
      this.error.set(this.translate.instant('savings.errors.invalid'));
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .updateSavingsSettings({
        monthly_target: this.pendingTarget,
        start_month: `${this.pendingStart}-01`,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(extractError(err, this.translate.instant('savings.errors.save')));
        },
      });
  }
}
