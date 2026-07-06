import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FxModal, staggerTilesSoon } from '../../shared/animations';
import { forkJoin } from 'rxjs';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { toIsoDate, todayIso } from '../../core/date-utils';
import { eur } from '../../core/format';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import {
  Budget,
  CATEGORY_COLORS,
  Category,
  MonthSummary,
  Transaction,
} from '../../core/models';
import { EchartComponent } from '../../shared/echart.component';
import { BudgetReportTab } from './budget-report.tab';
import { MonthlyPlanTab } from './monthly-plan.tab';
import { SavingsTab } from './savings.tab';

const DARK_SURFACE = '#0f172a'; // slate-900 — the chart card surface in dark mode

type FinanceTab = 'overview' | 'plan' | 'budgets' | 'savings';

@Component({
  selector: 'app-finance-page',
  imports: [FormsModule, EchartComponent, BudgetReportTab, MonthlyPlanTab, SavingsTab, TranslatePipe, FxModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'finance.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">
          {{ tab() === 'savings' ? ('finance.savingsGoal' | translate) : monthLabel() }}
        </p>
      </div>
      @if (tab() !== 'savings') {
        <div class="flex items-center gap-2">
          <button (click)="shiftMonth(-1)" class="rounded-control border border-edge-strong px-3 py-2 hover:bg-field transition-colors" [attr.aria-label]="'finance.prevMonth' | translate">←</button>
          <button (click)="goCurrentMonth()" class="rounded-control border border-edge-strong px-4 py-2 text-sm hover:bg-field transition-colors">{{ 'finance.thisMonth' | translate }}</button>
          <button (click)="shiftMonth(1)" class="rounded-control border border-edge-strong px-3 py-2 hover:bg-field transition-colors" [attr.aria-label]="'finance.nextMonth' | translate">→</button>
          @if (tab() === 'overview') {
            <button (click)="openAdd()" class="ml-2 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
              {{ 'finance.addTransaction' | translate }}
            </button>
          }
        </div>
      }
    </header>

    <nav class="mb-6 flex gap-1 rounded-card bg-card border border-edge p-1 w-fit">
      @for (t of tabs; track t.key) {
        <button
          (click)="setTab(t.key)"
          [class]="'rounded-control px-4 py-2 text-sm transition-colors ' +
            (tab() === t.key ? 'bg-pill text-white font-medium' : 'text-ink-muted hover:text-ink')"
        >
          {{ t.labelKey | translate }}
        </button>
      }
    </nav>

    @if (tab() === 'plan') {
      <app-monthly-plan-tab [month]="monthIso()" />
    } @else if (tab() === 'budgets') {
      <app-budget-report-tab [month]="monthIso()" />
    } @else if (tab() === 'savings') {
      <app-savings-tab />
    } @else if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (summary(); as s) {
      <!-- Stat tiles -->
      <div class="grid gap-4 sm:grid-cols-3 mb-6">
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'finance.income' | translate }}</p>
          <p class="text-2xl font-semibold mt-1">{{ eur(s.income_total) }}</p>
        </div>
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'finance.expenses' | translate }}</p>
          <p class="text-2xl font-semibold mt-1">{{ eur(s.expense_total) }}</p>
        </div>
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'finance.net' | translate }}</p>
          <p class="text-2xl font-semibold mt-1" [class]="s.net >= 0 ? 'text-success' : 'text-danger'">
            {{ eur(s.net) }}
          </p>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2 mb-6">
        <!-- Expenses by category (donut) -->
        <div class="rounded-card border border-edge bg-card p-5">
          <h2 class="font-semibold mb-2">{{ 'finance.byCategory' | translate }}</h2>
          @if (s.expenses_by_category.length > 0) {
            <div class="h-72">
              <app-echart [option]="donutOption()" />
            </div>
          } @else {
            <p class="text-sm text-ink-faint py-10 text-center">{{ 'finance.noExpenses' | translate }}</p>
          }
        </div>

        <!-- Budgets vs spent -->
        <div class="rounded-card border border-edge bg-card p-5">
          <h2 class="font-semibold mb-4">{{ 'finance.budgets' | translate }}</h2>
          @if (budgetError()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
              {{ budgetError() }}
            </p>
          }
          @if (expenseCategories().length === 0) {
            <p class="text-sm text-ink-faint py-10 text-center">
              {{ 'finance.noExpenseCategories' | translate }}
            </p>
          }
          <div class="space-y-4">
            @for (cat of expenseCategories(); track cat.id) {
              <div>
                <div class="flex items-center justify-between text-sm mb-1">
                  <span class="flex items-center gap-2">
                    <span class="h-3 w-3 rounded-full" [style.background]="cat.color"></span>
                    {{ cat.name }}
                  </span>
                  <span class="text-ink-muted">
                    {{ eur(spentFor(cat.id)) }}
                    @if (budgetFor(cat.id) !== null) { / {{ eur(budgetFor(cat.id)!) }} }
                  </span>
                </div>
                <div class="h-2 rounded-full bg-field overflow-hidden">
                  <div
                    class="h-full rounded-full"
                    [style.background]="overBudget(cat.id) ? '#e66767' : cat.color"
                    [style.width.%]="budgetPct(cat.id)"
                  ></div>
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="10"
                    [name]="'budget-' + cat.id"
                    class="w-28 rounded-control bg-field border border-edge-strong px-2 py-1 text-xs"
                    [placeholder]="'finance.budgetPlaceholder' | translate"
                    [(ngModel)]="pendingBudgets[cat.id]"
                  />
                  <button
                    (click)="saveBudget(cat.id)"
                    class="rounded-control border border-edge-strong px-2 py-1 text-xs text-ink-soft hover:bg-field"
                  >
                    {{ 'common.save' | translate }}
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Transactions -->
      <div class="rounded-card border border-edge bg-card overflow-hidden">
        <h2 class="font-semibold px-5 pt-5 pb-3">{{ 'finance.transactions' | translate }}</h2>
        @if (transactions().length === 0) {
          <p class="text-sm text-ink-faint px-5 pb-6">{{ 'finance.noTransactions' | translate }}</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-ink-muted border-t border-edge">
                  <th class="px-5 py-2.5 font-medium">{{ 'finance.date' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium">{{ 'finance.category' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium">{{ 'finance.description' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium">{{ 'finance.status' | translate }}</th>
                  <th class="px-5 py-2.5 font-medium text-right">{{ 'finance.amount' | translate }}</th>
                  <th class="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                @for (tx of transactions(); track tx.id) {
                  <tr class="border-t border-edge-soft hover:bg-row-hover">
                    <td class="px-5 py-2.5 text-ink-soft tabular-nums">{{ tx.date }}</td>
                    <td class="px-5 py-2.5">
                      @if (categoryOf(tx.category_id); as cat) {
                        <span class="inline-flex items-center gap-1.5">
                          <span class="h-2.5 w-2.5 rounded-full" [style.background]="cat.color"></span>
                          {{ cat.name }}
                        </span>
                      } @else {
                        <span class="text-ink-faint">—</span>
                      }
                    </td>
                    <td class="px-5 py-2.5 text-ink-soft">
                      {{ tx.description || '—' }}
                      @if (tx.recurring_id !== null) {
                        <span class="ml-1 text-ink-faint" [title]="'finance.fromRecurring' | translate">↻</span>
                      }
                    </td>
                    <td class="px-5 py-2.5">
                      <button
                        (click)="toggleStatus(tx)"
                        [class]="'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ' +
                          (tx.status === 'paid'
                            ? 'bg-success-surface text-success border border-success-edge'
                            : 'bg-warn-surface text-warn border border-warn-edge hover:bg-warn-hover')"
                        [title]="(tx.status === 'paid' ? 'finance.markUnpaid' : 'finance.markPaid') | translate"
                      >
                        {{ (tx.status === 'paid' ? 'finance.paid' : 'finance.unpaid') | translate }}
                      </button>
                    </td>
                    <td
                      class="px-5 py-2.5 text-right tabular-nums font-medium"
                      [class]="tx.kind === 'income' ? 'text-success' : 'text-ink'"
                    >
                      {{ tx.kind === 'income' ? '+' : '−' }}{{ eur(tx.amount) }}
                    </td>
                    <td class="px-2 py-2.5 text-right whitespace-nowrap">
                      <button
                        (click)="openEdit(tx)"
                        class="text-ink-faint hover:text-ink px-1"
                        [title]="'finance.editTx' | translate"
                      >
                        ✎
                      </button>
                      <button
                        (click)="removeTransaction(tx)"
                        class="text-ink-faint hover:text-danger px-1"
                        [title]="'finance.deleteTx' | translate"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- Add transaction modal -->
    @if (showAdd()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showAdd.set(false)">
        <div class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">
            {{ (editingTx() ? 'finance.editTxTitle' : 'finance.newTxTitle') | translate }}
          </h2>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submitTransaction()">
            <div class="grid grid-cols-2 gap-1 rounded-control bg-field p-1">
              <button type="button" (click)="setKind('expense')"
                [class]="'rounded-control py-1.5 text-sm transition-colors ' + (txKind() === 'expense' ? 'bg-pill text-white' : 'text-ink-muted')">
                {{ 'finance.expense' | translate }}
              </button>
              <button type="button" (click)="setKind('income')"
                [class]="'rounded-control py-1.5 text-sm transition-colors ' + (txKind() === 'income' ? 'bg-pill text-white' : 'text-ink-muted')">
                {{ 'finance.incomeKind' | translate }}
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="txAmount" class="block text-sm text-ink-soft mb-1">{{ 'finance.amountEur' | translate }}</label>
                <input id="txAmount" name="txAmount" type="number" step="0.01" min="0.01" required
                  [(ngModel)]="txAmount"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
              </div>
              <div>
                <label for="txDate" class="block text-sm text-ink-soft mb-1">{{ 'finance.date' | translate }}</label>
                <input id="txDate" name="txDate" type="date" required [(ngModel)]="txDate"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
              </div>
            </div>

            <div>
              <label for="txCategory" class="block text-sm text-ink-soft mb-1">{{ 'finance.category' | translate }}</label>
              <select id="txCategory" name="txCategory" [(ngModel)]="txCategoryId"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2">
                <option [ngValue]="null">{{ 'finance.noCategory' | translate }}</option>
                @for (cat of categoriesForKind(); track cat.id) {
                  <option [ngValue]="cat.id">{{ cat.name }}</option>
                }
                <option [ngValue]="-1">{{ 'finance.newCategory' | translate }}</option>
              </select>
            </div>

            @if (txCategoryId === -1) {
              <div class="rounded-card border border-edge-strong bg-field-soft p-3 space-y-3">
                <input name="newCatName" [placeholder]="'finance.categoryName' | translate" [(ngModel)]="newCategoryName"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
                <div class="flex gap-2">
                  @for (c of categoryColors; track c) {
                    <button type="button" (click)="newCategoryColor.set(c)"
                      class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                      [style.background]="c"
                      [style.border-color]="newCategoryColor() === c ? swatchRing() : 'transparent'"></button>
                  }
                </div>
              </div>
            }

            <div>
              <label for="txDesc" class="block text-sm text-ink-soft mb-1">{{ 'finance.description' | translate }}</label>
              <input id="txDesc" name="txDesc" [(ngModel)]="txDescription" [placeholder]="'common.optional' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showAdd.set(false)"
                class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field">
                {{ 'common.cancel' | translate }}
              </button>
              <button type="submit" [disabled]="saving()"
                class="rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium">
                {{ (saving() ? 'common.saving' : 'common.save') | translate }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class FinancePage {
  private readonly api = inject(FinanceApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  readonly themeService = inject(ThemeService);

  readonly categoryColors = CATEGORY_COLORS;

  readonly monthAnchor = signal(firstOfMonth(new Date()));
  readonly loading = signal(true);
  readonly summary = signal<MonthSummary | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly budgets = signal<Budget[]>([]);

  readonly tabs: { key: FinanceTab; labelKey: string }[] = [
    { key: 'overview', labelKey: 'finance.tabs.overview' },
    { key: 'plan', labelKey: 'finance.tabs.plan' },
    { key: 'budgets', labelKey: 'finance.tabs.budgets' },
    { key: 'savings', labelKey: 'finance.tabs.savings' },
  ];
  readonly tab = signal<FinanceTab>('overview');
  readonly showAdd = signal(false);
  readonly editingTx = signal<Transaction | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly budgetError = signal<string | null>(null);
  /** Monotonic counter so out-of-order month loads can't overwrite newer data. */
  private loadSeq = 0;
  readonly txKind = signal<'income' | 'expense'>('expense');
  readonly newCategoryColor = signal(CATEGORY_COLORS[0]);
  txAmount: number | null = null;
  txDate = todayIso();
  txCategoryId: number | null = null;
  txDescription = '';
  newCategoryName = '';
  pendingBudgets: Record<number, number> = {};

  readonly monthLabel = computed(() =>
    this.monthAnchor().toLocaleDateString(this.language.locale(), {
      month: 'long',
      year: 'numeric',
    }),
  );

  readonly monthIso = computed(() => toIsoDate(this.monthAnchor()));

  readonly expenseCategories = computed(() =>
    this.categories().filter((c) => c.kind === 'expense'),
  );

  readonly categoriesForKind = computed(() =>
    this.categories().filter((c) => c.kind === this.txKind()),
  );

  readonly donutOption = computed(() => {
    const dark = this.themeService.effective() === 'dark';
    const rows = this.summary()?.expenses_by_category ?? [];
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: dark ? '#1e293b' : '#ffffff',
        borderColor: dark ? '#334155' : '#e2e8f0',
        textStyle: { color: dark ? '#e2e8f0' : '#0f172a' },
        valueFormatter: (v: number) => this.eur(v),
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        textStyle: { color: dark ? '#94a3b8' : '#475569' },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '44%'],
          itemStyle: { borderColor: dark ? DARK_SURFACE : '#ffffff', borderWidth: 2, borderRadius: 4 },
          label: {
            color: dark ? '#cbd5e1' : '#334155',
            formatter: (p: { name: string; value: number }) => `${p.name}\n${this.eur(p.value)}`,
          },
          labelLine: { lineStyle: { color: dark ? '#475569' : '#94a3b8' } },
          data: rows.map((r) => ({
            name: r.name,
            value: r.spent,
            itemStyle: { color: r.color },
          })),
        },
      ],
    };
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    const month = toIsoDate(this.monthAnchor());
    forkJoin({
      summary: this.api.summary(month),
      categories: this.api.listCategories(),
      transactions: this.api.listTransactions(month),
      budgets: this.api.listBudgets(month),
    }).subscribe({
      next: ({ summary, categories, transactions, budgets }) => {
        if (seq !== this.loadSeq) return; // a newer month was requested meanwhile
        this.summary.set(summary);
        this.categories.set(categories);
        this.transactions.set(transactions);
        this.budgets.set(budgets);
        this.pendingBudgets = Object.fromEntries(
          budgets.map((b) => [b.category_id, b.amount]),
        );
        this.budgetError.set(null);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: () => {
        if (seq === this.loadSeq) this.loading.set(false);
      },
    });
  }

  shiftMonth(direction: number): void {
    const d = this.monthAnchor();
    this.monthAnchor.set(new Date(d.getFullYear(), d.getMonth() + direction, 1));
    this.load();
  }

  goCurrentMonth(): void {
    this.monthAnchor.set(firstOfMonth(new Date()));
    this.load();
  }

  readonly eur = eur;

  /** Ring color for the selected color swatch — must contrast with the card surface. */
  readonly swatchRing = computed(() =>
    this.themeService.effective() === 'dark' ? 'white' : '#0f172a',
  );

  setTab(tab: FinanceTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    // Plan/savings actions (paid toggles, skips) change transactions; reload
    // the overview data when coming back to it.
    if (tab === 'overview') this.load();
  }

  categoryOf(id: number | null): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }

  spentFor(categoryId: number): number {
    return (
      this.summary()?.expenses_by_category.find((c) => c.category_id === categoryId)?.spent ?? 0
    );
  }

  budgetFor(categoryId: number): number | null {
    return this.budgets().find((b) => b.category_id === categoryId)?.amount ?? null;
  }

  budgetPct(categoryId: number): number {
    const budget = this.budgetFor(categoryId);
    const spent = this.spentFor(categoryId);
    // budget === 0 is a real budget ("spend nothing"): any spend fills the bar.
    if (budget === null || budget === 0) return spent > 0 ? 100 : 0;
    return Math.min((spent / budget) * 100, 100);
  }

  overBudget(categoryId: number): boolean {
    const budget = this.budgetFor(categoryId);
    return budget !== null && this.spentFor(categoryId) > budget;
  }

  saveBudget(categoryId: number): void {
    const amount = this.pendingBudgets[categoryId];
    if (amount === undefined || amount === null || !Number.isFinite(amount) || amount < 0) {
      this.budgetError.set(this.translate.instant('finance.errors.budgetAmount'));
      return;
    }
    this.budgetError.set(null);
    this.api.upsertBudget(categoryId, toIsoDate(this.monthAnchor()), amount).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.budgetError.set(extractError(err, this.translate.instant('finance.errors.saveBudget'))),
    });
  }

  setKind(kind: 'income' | 'expense'): void {
    if (this.txKind() === kind) return;
    this.txKind.set(kind);
    // Categories are kind-specific; keeping the old selection would submit a
    // category of the wrong kind (422) while the select looks blank.
    this.txCategoryId = null;
  }

  openAdd(): void {
    this.error.set(null);
    this.editingTx.set(null);
    this.txAmount = null;
    this.txDate = todayIso();
    this.txCategoryId = null;
    this.txDescription = '';
    this.newCategoryName = '';
    this.showAdd.set(true);
  }

  openEdit(tx: Transaction): void {
    this.error.set(null);
    this.editingTx.set(tx);
    this.txKind.set(tx.kind);
    this.txAmount = tx.amount;
    this.txDate = tx.date;
    this.txCategoryId = tx.category_id;
    this.txDescription = tx.description ?? '';
    this.newCategoryName = '';
    this.showAdd.set(true);
  }

  toggleStatus(tx: Transaction): void {
    const next = tx.status === 'paid' ? 'unpaid' : 'paid';
    this.api.setTransactionStatus(tx.id, next).subscribe({
      next: () => this.load(),
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('finance.errors.status'))),
    });
  }

  submitTransaction(): void {
    if (!this.txAmount || this.txAmount <= 0 || !this.txDate) {
      this.error.set(this.translate.instant('finance.errors.amountDate'));
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    if (this.txCategoryId === -1) {
      if (!this.newCategoryName.trim()) {
        this.saving.set(false);
        this.error.set(this.translate.instant('finance.errors.nameCategory'));
        return;
      }
      this.api
        .createCategory(this.newCategoryName.trim(), this.txKind(), this.newCategoryColor())
        .subscribe({
          next: (cat) => this.createTx(cat.id),
          error: (err) => {
            this.saving.set(false);
            this.error.set(
              extractError(err, this.translate.instant('finance.errors.createCategory')),
            );
          },
        });
    } else {
      this.createTx(this.txCategoryId);
    }
  }

  private createTx(categoryId: number | null): void {
    const editing = this.editingTx();
    const payload = {
      kind: this.txKind(),
      amount: this.txAmount!,
      description: this.txDescription.trim() || null,
      date: this.txDate,
      category_id: categoryId,
      // PUT replaces the whole row; keep the existing paid/unpaid state on edits.
      status: editing?.status ?? 'paid',
    };
    const request = editing
      ? this.api.updateTransaction(editing.id, payload)
      : this.api.createTransaction(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.showAdd.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('finance.errors.saveTx')));
      },
    });
  }

  removeTransaction(tx: Transaction): void {
    const message = this.translate.instant(
      tx.recurring_id !== null ? 'finance.deleteRecurringConfirm' : 'finance.deleteConfirm',
    );
    if (!confirm(message)) return;
    this.api.deleteTransaction(tx.id).subscribe({ next: () => this.load() });
  }
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
