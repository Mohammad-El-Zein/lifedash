import { Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { eur } from '../../core/format';
import { extractError } from '../../core/http-error';
import { Category, FixedItem, MonthlyPlan, RecurringTransaction } from '../../core/models';
import { RecurringFormModal } from './recurring-form.modal';
import { staggerTilesSoon } from '../../shared/animations';

@Component({
  selector: 'app-monthly-plan-tab',
  imports: [RecurringFormModal, TranslatePipe],
  template: `
    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (plan(); as p) {
      @if (error()) {
        <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
          {{ error() }}
        </p>
      }

      <!-- Plan stat tiles -->
      <div class="grid gap-4 sm:grid-cols-3 mb-6">
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'plan.totalIncome' | translate }}</p>
          <p class="text-2xl font-semibold mt-1">{{ eur(p.income_total) }}</p>
          <p class="text-xs text-ink-faint mt-1">
            {{ 'plan.incomeBreakdown' | translate: {
              recurring: eur(p.recurring_income_total),
              oneOff: eur(p.one_off_income_total)
            } }}
          </p>
        </div>
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'plan.fixedExpenses' | translate }}</p>
          <p class="text-2xl font-semibold mt-1">{{ eur(p.fixed_expense_total) }}</p>
          <p class="text-xs text-ink-faint mt-1">
            {{ 'plan.recurringCount' | translate: { n: p.fixed_items.length } }}
          </p>
        </div>
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'plan.available' | translate }}</p>
          <p class="text-2xl font-semibold mt-1" [class]="p.available_for_variable >= 0 ? 'text-success' : 'text-danger'">
            {{ eur(p.available_for_variable) }}
          </p>
          <p class="text-xs text-ink-faint mt-1">
            {{ 'plan.alreadySpent' | translate: { amount: eur(p.variable_expense_total) } }}
          </p>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Fixed expenses checklist -->
        <div class="rounded-card border border-edge bg-card p-5">
          <div class="flex items-center justify-between mb-1">
            <h2 class="font-semibold">{{ 'plan.fixedExpenses' | translate }}</h2>
            <span class="text-sm text-ink-muted">
              {{ 'plan.paidOf' | translate: { paid: p.fixed_paid_count, total: p.fixed_items.length } }}
            </span>
          </div>
          <div class="h-2 rounded-full bg-field overflow-hidden mb-4">
            <div class="h-full rounded-full bg-success" [style.width.%]="paidPct()"></div>
          </div>
          @if (p.fixed_items.length === 0) {
            <p class="text-sm text-ink-faint py-6 text-center">
              {{ 'plan.noFixed' | translate }}
            </p>
          }
          <ul class="space-y-2">
            @for (item of p.fixed_items; track item.transaction_id) {
              <li class="flex items-center justify-between gap-3 rounded-control border border-edge px-3 py-2">
                <div class="min-w-0">
                  <p class="truncate">{{ item.description || '—' }}</p>
                  <p class="text-xs text-ink-faint tabular-nums">{{ item.date }}</p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="tabular-nums font-medium">{{ eur(item.amount) }}</span>
                  <button
                    (click)="toggleStatus(item)"
                    [class]="'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                      (item.status === 'paid'
                        ? 'bg-success-surface text-success border border-success-edge'
                        : 'bg-warn-surface text-warn border border-warn-edge hover:bg-warn-hover')"
                    [title]="(item.status === 'paid' ? 'finance.markUnpaid' : 'finance.markPaid') | translate"
                  >
                    {{ (item.status === 'paid' ? 'finance.paid' : 'finance.unpaid') | translate }}
                  </button>
                </div>
              </li>
            }
          </ul>
        </div>

        <!-- Recurring templates -->
        <div class="rounded-card border border-edge bg-card p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold">{{ 'plan.recurringTitle' | translate }}</h2>
            <button (click)="openAdd()" class="rounded-control bg-accent hover:bg-accent-hover px-3 py-1.5 text-sm font-medium transition-colors">
              {{ 'plan.addRecurring' | translate }}
            </button>
          </div>
          @if (recurring().length === 0) {
            <p class="text-sm text-ink-faint py-6 text-center">
              {{ 'plan.noRecurring' | translate }}
            </p>
          }
          <ul class="space-y-2">
            @for (rec of recurring(); track rec.id) {
              <li class="rounded-control border border-edge px-3 py-2" [class.opacity-50]="!rec.is_active">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate">
                      {{ rec.description }}
                      @if (!rec.is_active) { <span class="text-xs text-ink-faint">{{ 'plan.paused' | translate }}</span> }
                    </p>
                    <p class="text-xs text-ink-faint">
                      {{ 'plan.day' | translate: { n: rec.day_of_month } }} ·
                      {{ 'plan.since' | translate }} {{ rec.start_month.slice(0, 7) }}
                      @if (rec.end_month) { · {{ 'plan.until' | translate }} {{ rec.end_month.slice(0, 7) }} }
                      @if (skippedThisMonth(rec)) { · <span class="text-warn">{{ 'plan.skippedThisMonth' | translate }}</span> }
                    </p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="tabular-nums font-medium" [class]="rec.kind === 'income' ? 'text-success' : ''">
                      {{ rec.kind === 'income' ? '+' : '−' }}{{ eur(rec.amount) }}
                    </span>
                    @if (skippedThisMonth(rec)) {
                      <button (click)="unskip(rec)" class="text-xs text-ink-muted hover:text-ink border border-edge-strong rounded-control px-2 py-1" [title]="'plan.unskipTitle' | translate">
                        {{ 'plan.unskip' | translate }}
                      </button>
                    } @else {
                      <button (click)="skip(rec)" class="text-xs text-ink-muted hover:text-warn border border-edge-strong rounded-control px-2 py-1" [title]="'plan.skipTitle' | translate">
                        {{ 'plan.skip' | translate }}
                      </button>
                    }
                    <button (click)="openEdit(rec)" class="text-ink-faint hover:text-ink px-1" [title]="'common.edit' | translate">✎</button>
                    <button (click)="remove(rec)" class="text-ink-faint hover:text-danger px-1" [title]="'plan.deleteTemplate' | translate">✕</button>
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>
      </div>
    }

    @if (showForm()) {
      <app-recurring-form-modal
        [recurring]="editing()"
        [categories]="categories()"
        (closed)="showForm.set(false)"
        (saved)="onSaved()"
      />
    }
  `,
})
export class MonthlyPlanTab {
  private readonly api = inject(FinanceApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);

  /** ISO date (any day) of the month to plan, e.g. "2026-07-01". */
  readonly month = input.required<string>();

  readonly loading = signal(true);
  readonly plan = signal<MonthlyPlan | null>(null);
  readonly recurring = signal<RecurringTransaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly error = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly editing = signal<RecurringTransaction | null>(null);
  /** Monotonic counter so out-of-order month loads can't overwrite newer data. */
  private loadSeq = 0;

  readonly eur = eur;

  readonly paidPct = computed(() => {
    const p = this.plan();
    if (!p || p.fixed_items.length === 0) return 0;
    return (p.fixed_paid_count / p.fixed_items.length) * 100;
  });

  constructor() {
    effect(() => {
      this.month(); // reload whenever the selected month changes
      this.load();
    });
  }

  load(): void {
    const seq = ++this.loadSeq;
    forkJoin({
      plan: this.api.monthlyPlan(this.month()),
      recurring: this.api.listRecurring(),
      categories: this.api.listCategories(),
    }).subscribe({
      next: ({ plan, recurring, categories }) => {
        if (seq !== this.loadSeq) return;
        this.plan.set(plan);
        this.recurring.set(recurring);
        this.categories.set(categories);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: (err) => {
        if (seq !== this.loadSeq) return;
        this.loading.set(false);
        this.error.set(extractError(err, this.translate.instant('plan.errors.load')));
      },
    });
  }

  private monthStart(): string {
    return `${this.month().slice(0, 7)}-01`;
  }

  skippedThisMonth(rec: RecurringTransaction): boolean {
    return rec.skipped_months.includes(this.monthStart());
  }

  toggleStatus(item: FixedItem): void {
    const next = item.status === 'paid' ? 'unpaid' : 'paid';
    this.api.setTransactionStatus(item.transaction_id, next).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('plan.errors.status'))),
    });
  }

  skip(rec: RecurringTransaction): void {
    if (!confirm(this.translate.instant('plan.skipConfirm', { name: rec.description }))) return;
    this.api.skipRecurringMonth(rec.id, this.monthStart()).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('plan.errors.skip'))),
    });
  }

  unskip(rec: RecurringTransaction): void {
    this.api.unskipRecurringMonth(rec.id, this.monthStart()).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('plan.errors.unskip'))),
    });
  }

  openAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
  }

  openEdit(rec: RecurringTransaction): void {
    this.editing.set(rec);
    this.showForm.set(true);
  }

  onSaved(): void {
    this.showForm.set(false);
    this.load();
  }

  remove(rec: RecurringTransaction): void {
    if (!confirm(this.translate.instant('plan.deleteConfirm', { name: rec.description }))) return;
    this.api.deleteRecurring(rec.id).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('plan.errors.delete'))),
    });
  }
}
