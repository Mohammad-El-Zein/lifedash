import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { eur } from '../../core/format';
import { extractError } from '../../core/http-error';
import { CategorySummary, MonthSummary } from '../../core/models';

interface BudgetRow extends CategorySummary {
  budget: number;
  diff: number;
}

@Component({
  selector: 'app-budget-report-tab',
  imports: [TranslatePipe],
  template: `
    @if (error()) {
      <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
        {{ error() }}
      </p>
    }
    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (rows().length === 0) {
      <div class="rounded-card border border-edge bg-card p-5">
        <p class="text-sm text-ink-faint py-10 text-center">
          {{ 'budgetReport.none' | translate }}
        </p>
      </div>
    } @else {
      <div class="rounded-card border border-edge bg-card overflow-hidden">
        <h2 class="font-semibold px-5 pt-5 pb-3">{{ 'budgetReport.title' | translate }}</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-ink-muted border-t border-edge">
                <th class="px-5 py-2.5 font-medium">{{ 'budgetReport.category' | translate }}</th>
                <th class="px-5 py-2.5 font-medium text-right">{{ 'budgetReport.budget' | translate }}</th>
                <th class="px-5 py-2.5 font-medium text-right">{{ 'budgetReport.spent' | translate }}</th>
                <th class="px-5 py-2.5 font-medium text-right">±</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.category_id) {
                <tr class="border-t border-edge-soft hover:bg-row-hover">
                  <td class="px-5 py-2.5 text-ink-soft">
                    <span class="flex items-center gap-2">
                      <span class="h-3 w-3 rounded-full shrink-0" [style.background]="row.color"></span>
                      {{ row.name }}
                    </span>
                  </td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-ink-muted">{{ eur(row.budget) }}</td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">{{ eur(row.spent) }}</td>
                  <td
                    class="px-5 py-2.5 text-right tabular-nums font-medium"
                    [class]="row.diff >= 0 ? 'text-success' : 'text-danger'"
                  >
                    {{ row.diff >= 0 ? '+' : '' }}{{ eur(row.diff) }}
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t border-edge-strong font-semibold">
                <td class="px-5 py-3">{{ 'common.total' | translate }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ eur(totals().budget) }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ eur(totals().spent) }}</td>
                <td
                  class="px-5 py-3 text-right tabular-nums"
                  [class]="totals().diff >= 0 ? 'text-success' : 'text-danger'"
                >
                  {{ totals().diff >= 0 ? '+' : '' }}{{ eur(totals().diff) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    }
  `,
})
export class BudgetReportTab {
  private readonly api = inject(FinanceApiService);
  private readonly translate = inject(TranslateService);

  /** ISO date (any day) of the month to report on, e.g. "2026-07-01". */
  readonly month = input.required<string>();

  readonly loading = signal(true);
  readonly summary = signal<MonthSummary | null>(null);
  readonly error = signal<string | null>(null);
  /** Monotonic counter so out-of-order month loads can't overwrite newer data. */
  private loadSeq = 0;

  readonly eur = eur;

  /** Categories with a budget set this month; uncategorised spending never has one. */
  readonly rows = computed<BudgetRow[]>(() =>
    (this.summary()?.expenses_by_category ?? [])
      .filter((c): c is CategorySummary & { budget: number } => c.budget !== null)
      .map((c) => ({ ...c, diff: c.budget - c.spent })),
  );

  readonly totals = computed(() => {
    const rows = this.rows();
    const budget = rows.reduce((sum, r) => sum + r.budget, 0);
    const spent = rows.reduce((sum, r) => sum + r.spent, 0);
    return { budget, spent, diff: budget - spent };
  });

  constructor() {
    effect(() => {
      this.month(); // reload whenever the selected month changes
      this.load();
    });
  }

  load(): void {
    const seq = ++this.loadSeq;
    this.api.summary(this.month()).subscribe({
      next: (summary) => {
        if (seq !== this.loadSeq) return;
        this.summary.set(summary);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err) => {
        if (seq !== this.loadSeq) return;
        this.loading.set(false);
        this.error.set(extractError(err, this.translate.instant('budgetReport.errors.load')));
      },
    });
  }
}
