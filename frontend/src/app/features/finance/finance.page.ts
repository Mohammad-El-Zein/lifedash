import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { toIsoDate, todayIso } from '../../core/date-utils';
import { eur } from '../../core/format';
import { extractError } from '../../core/http-error';
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

const SURFACE = '#0f172a'; // bg-slate-900 — the chart card surface

type FinanceTab = 'overview' | 'plan' | 'budgets' | 'savings';

@Component({
  selector: 'app-finance-page',
  imports: [FormsModule, EchartComponent, BudgetReportTab, MonthlyPlanTab, SavingsTab],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Finance</h1>
        <p class="text-slate-400 mt-1">{{ tab() === 'savings' ? 'Savings goal' : monthLabel() }}</p>
      </div>
      @if (tab() !== 'savings') {
        <div class="flex items-center gap-2">
          <button (click)="shiftMonth(-1)" class="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800 transition-colors" aria-label="Previous month">←</button>
          <button (click)="goCurrentMonth()" class="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 transition-colors">This month</button>
          <button (click)="shiftMonth(1)" class="rounded-lg border border-slate-700 px-3 py-2 hover:bg-slate-800 transition-colors" aria-label="Next month">→</button>
          @if (tab() === 'overview') {
            <button (click)="openAdd()" class="ml-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium transition-colors">
              + Add transaction
            </button>
          }
        </div>
      }
    </header>

    <nav class="mb-6 flex gap-1 rounded-xl bg-slate-900 border border-slate-800 p-1 w-fit">
      @for (t of tabs; track t.key) {
        <button
          (click)="setTab(t.key)"
          [class]="'rounded-lg px-4 py-2 text-sm transition-colors ' +
            (tab() === t.key ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200')"
        >
          {{ t.label }}
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
      <p class="text-slate-400">Loading…</p>
    } @else if (summary(); as s) {
      <!-- Stat tiles -->
      <div class="grid gap-4 sm:grid-cols-3 mb-6">
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p class="text-sm text-slate-400">Income</p>
          <p class="text-2xl font-semibold mt-1">{{ eur(s.income_total) }}</p>
        </div>
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p class="text-sm text-slate-400">Expenses</p>
          <p class="text-2xl font-semibold mt-1">{{ eur(s.expense_total) }}</p>
        </div>
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p class="text-sm text-slate-400">Net</p>
          <p class="text-2xl font-semibold mt-1" [class]="s.net >= 0 ? 'text-emerald-400' : 'text-red-400'">
            {{ eur(s.net) }}
          </p>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2 mb-6">
        <!-- Expenses by category (donut) -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 class="font-semibold mb-2">Expenses by category</h2>
          @if (s.expenses_by_category.length > 0) {
            <div class="h-72">
              <app-echart [option]="donutOption()" />
            </div>
          } @else {
            <p class="text-sm text-slate-500 py-10 text-center">No expenses this month yet.</p>
          }
        </div>

        <!-- Budgets vs spent -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 class="font-semibold mb-4">Budgets</h2>
          @if (budgetError()) {
            <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">
              {{ budgetError() }}
            </p>
          }
          @if (expenseCategories().length === 0) {
            <p class="text-sm text-slate-500 py-10 text-center">
              Create an expense category to set budgets.
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
                  <span class="text-slate-400">
                    {{ eur(spentFor(cat.id)) }}
                    @if (budgetFor(cat.id) !== null) { / {{ eur(budgetFor(cat.id)!) }} }
                  </span>
                </div>
                <div class="h-2 rounded-full bg-slate-800 overflow-hidden">
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
                    class="w-28 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
                    [placeholder]="'Budget €'"
                    [(ngModel)]="pendingBudgets[cat.id]"
                  />
                  <button
                    (click)="saveBudget(cat.id)"
                    class="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Save
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Transactions -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <h2 class="font-semibold px-5 pt-5 pb-3">Transactions</h2>
        @if (transactions().length === 0) {
          <p class="text-sm text-slate-500 px-5 pb-6">No transactions this month.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-slate-400 border-t border-slate-800">
                  <th class="px-5 py-2.5 font-medium">Date</th>
                  <th class="px-5 py-2.5 font-medium">Category</th>
                  <th class="px-5 py-2.5 font-medium">Description</th>
                  <th class="px-5 py-2.5 font-medium">Status</th>
                  <th class="px-5 py-2.5 font-medium text-right">Amount</th>
                  <th class="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                @for (tx of transactions(); track tx.id) {
                  <tr class="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td class="px-5 py-2.5 text-slate-300 tabular-nums">{{ tx.date }}</td>
                    <td class="px-5 py-2.5">
                      @if (categoryOf(tx.category_id); as cat) {
                        <span class="inline-flex items-center gap-1.5">
                          <span class="h-2.5 w-2.5 rounded-full" [style.background]="cat.color"></span>
                          {{ cat.name }}
                        </span>
                      } @else {
                        <span class="text-slate-500">—</span>
                      }
                    </td>
                    <td class="px-5 py-2.5 text-slate-300">
                      {{ tx.description || '—' }}
                      @if (tx.recurring_id !== null) {
                        <span class="ml-1 text-slate-500" title="Generated from a recurring transaction">↻</span>
                      }
                    </td>
                    <td class="px-5 py-2.5">
                      <button
                        (click)="toggleStatus(tx)"
                        [class]="'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ' +
                          (tx.status === 'paid'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800 hover:bg-amber-900')"
                        [title]="tx.status === 'paid' ? 'Mark as unpaid' : 'Mark as paid'"
                      >
                        {{ tx.status === 'paid' ? '✓ Paid' : 'Unpaid' }}
                      </button>
                    </td>
                    <td
                      class="px-5 py-2.5 text-right tabular-nums font-medium"
                      [class]="tx.kind === 'income' ? 'text-emerald-400' : 'text-slate-100'"
                    >
                      {{ tx.kind === 'income' ? '+' : '−' }}{{ eur(tx.amount) }}
                    </td>
                    <td class="px-2 py-2.5 text-right whitespace-nowrap">
                      <button
                        (click)="openEdit(tx)"
                        class="text-slate-500 hover:text-slate-200 px-1"
                        title="Edit transaction"
                      >
                        ✎
                      </button>
                      <button
                        (click)="removeTransaction(tx)"
                        class="text-slate-500 hover:text-red-400 px-1"
                        title="Delete transaction"
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
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" (click)="showAdd.set(false)">
        <div class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">{{ editingTx() ? 'Edit transaction' : 'New transaction' }}</h2>
          @if (error()) {
            <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submitTransaction()">
            <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
              <button type="button" (click)="setKind('expense')"
                [class]="'rounded-md py-1.5 text-sm transition-colors ' + (txKind() === 'expense' ? 'bg-slate-700 text-white' : 'text-slate-400')">
                Expense
              </button>
              <button type="button" (click)="setKind('income')"
                [class]="'rounded-md py-1.5 text-sm transition-colors ' + (txKind() === 'income' ? 'bg-slate-700 text-white' : 'text-slate-400')">
                Income
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="txAmount" class="block text-sm text-slate-300 mb-1">Amount (€)</label>
                <input id="txAmount" name="txAmount" type="number" step="0.01" min="0.01" required
                  [(ngModel)]="txAmount"
                  class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
              </div>
              <div>
                <label for="txDate" class="block text-sm text-slate-300 mb-1">Date</label>
                <input id="txDate" name="txDate" type="date" required [(ngModel)]="txDate"
                  class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
              </div>
            </div>

            <div>
              <label for="txCategory" class="block text-sm text-slate-300 mb-1">Category</label>
              <select id="txCategory" name="txCategory" [(ngModel)]="txCategoryId"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2">
                <option [ngValue]="null">No category</option>
                @for (cat of categoriesForKind(); track cat.id) {
                  <option [ngValue]="cat.id">{{ cat.name }}</option>
                }
                <option [ngValue]="-1">＋ New category…</option>
              </select>
            </div>

            @if (txCategoryId === -1) {
              <div class="rounded-xl border border-slate-700 bg-slate-800/50 p-3 space-y-3">
                <input name="newCatName" placeholder="Category name" [(ngModel)]="newCategoryName"
                  class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm" />
                <div class="flex gap-2">
                  @for (c of categoryColors; track c) {
                    <button type="button" (click)="newCategoryColor.set(c)"
                      class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                      [style.background]="c"
                      [style.border-color]="newCategoryColor() === c ? 'white' : 'transparent'"></button>
                  }
                </div>
              </div>
            }

            <div>
              <label for="txDesc" class="block text-sm text-slate-300 mb-1">Description</label>
              <input id="txDesc" name="txDesc" [(ngModel)]="txDescription" placeholder="Optional"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showAdd.set(false)"
                class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                Cancel
              </button>
              <button type="submit" [disabled]="saving()"
                class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
                {{ saving() ? 'Saving…' : 'Save' }}
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

  readonly categoryColors = CATEGORY_COLORS;

  readonly monthAnchor = signal(firstOfMonth(new Date()));
  readonly loading = signal(true);
  readonly summary = signal<MonthSummary | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly budgets = signal<Budget[]>([]);

  readonly tabs: { key: FinanceTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'plan', label: 'Monthly plan' },
    { key: 'budgets', label: 'Budget report' },
    { key: 'savings', label: 'Savings' },
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
    this.monthAnchor().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  );

  readonly monthIso = computed(() => toIsoDate(this.monthAnchor()));

  readonly expenseCategories = computed(() =>
    this.categories().filter((c) => c.kind === 'expense'),
  );

  readonly categoriesForKind = computed(() =>
    this.categories().filter((c) => c.kind === this.txKind()),
  );

  readonly donutOption = computed(() => {
    const rows = this.summary()?.expenses_by_category ?? [];
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0' },
        valueFormatter: (v: number) => this.eur(v),
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        textStyle: { color: '#94a3b8' },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '44%'],
          itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 4 },
          label: {
            color: '#cbd5e1',
            formatter: (p: { name: string; value: number }) => `${p.name}\n${this.eur(p.value)}`,
          },
          labelLine: { lineStyle: { color: '#475569' } },
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
      this.budgetError.set('Please enter a budget amount of 0 or more.');
      return;
    }
    this.budgetError.set(null);
    this.api.upsertBudget(categoryId, toIsoDate(this.monthAnchor()), amount).subscribe({
      next: () => this.load(),
      error: (err) => this.budgetError.set(extractError(err, 'Could not save the budget.')),
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
      error: (err) => this.error.set(extractError(err, 'Could not update the status.')),
    });
  }

  submitTransaction(): void {
    if (!this.txAmount || this.txAmount <= 0 || !this.txDate) {
      this.error.set('Please enter a positive amount and a date.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    if (this.txCategoryId === -1) {
      if (!this.newCategoryName.trim()) {
        this.saving.set(false);
        this.error.set('Please name the new category.');
        return;
      }
      this.api
        .createCategory(this.newCategoryName.trim(), this.txKind(), this.newCategoryColor())
        .subscribe({
          next: (cat) => this.createTx(cat.id),
          error: (err) => {
            this.saving.set(false);
            this.error.set(extractError(err, 'Could not create the category.'));
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
        this.error.set(extractError(err, 'Could not save the transaction.'));
      },
    });
  }

  removeTransaction(tx: Transaction): void {
    const message =
      tx.recurring_id !== null
        ? 'Delete this generated transaction? This skips the recurring transaction for this month.'
        : 'Delete this transaction?';
    if (!confirm(message)) return;
    this.api.deleteTransaction(tx.id).subscribe({ next: () => this.load() });
  }
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
