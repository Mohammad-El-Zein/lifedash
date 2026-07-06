import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { toIsoDate } from '../../core/date-utils';
import { extractError } from '../../core/http-error';
import { Category, RecurringPayload, RecurringTransaction } from '../../core/models';

@Component({
  selector: 'app-recurring-form-modal',
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" (click)="closed.emit()">
      <div
        class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        (click)="$event.stopPropagation()"
      >
        <h2 class="text-xl font-semibold mb-4">
          {{ (recurring() ? 'recurringForm.editTitle' : 'recurringForm.newTitle') | translate }}
        </h2>

        @if (error()) {
          <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">
            {{ error() }}
          </p>
        }

        <form class="space-y-4" (ngSubmit)="submit()">
          <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
            <button type="button" (click)="setKind('expense')"
              [class]="'rounded-md py-1.5 text-sm transition-colors ' + (kind() === 'expense' ? 'bg-slate-700 text-white' : 'text-slate-400')">
              {{ 'finance.expense' | translate }}
            </button>
            <button type="button" (click)="setKind('income')"
              [class]="'rounded-md py-1.5 text-sm transition-colors ' + (kind() === 'income' ? 'bg-slate-700 text-white' : 'text-slate-400')">
              {{ 'finance.incomeKind' | translate }}
            </button>
          </div>

          <div>
            <label for="recDesc" class="block text-sm text-slate-300 mb-1">{{ 'recurringForm.name' | translate }}</label>
            <input id="recDesc" name="recDesc" required [(ngModel)]="description"
              [placeholder]="'recurringForm.namePlaceholder' | translate"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="recAmount" class="block text-sm text-slate-300 mb-1">{{ 'recurringForm.amountEur' | translate }}</label>
              <input id="recAmount" name="recAmount" type="number" step="0.01" min="0.01" required
                [(ngModel)]="amount"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="recDay" class="block text-sm text-slate-300 mb-1">{{ 'recurringForm.dayOfMonth' | translate }}</label>
              <input id="recDay" name="recDay" type="number" min="1" max="31" required
                [(ngModel)]="dayOfMonth"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="recStart" class="block text-sm text-slate-300 mb-1">{{ 'recurringForm.firstMonth' | translate }}</label>
              <input id="recStart" name="recStart" type="month" required [(ngModel)]="startMonth"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="recEnd" class="block text-sm text-slate-300 mb-1">{{ 'recurringForm.lastMonth' | translate }}</label>
              <input id="recEnd" name="recEnd" type="month" [(ngModel)]="endMonth"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
              <p class="text-xs text-slate-500 mt-1">{{ 'recurringForm.openEnded' | translate }}</p>
            </div>
          </div>

          <div>
            <label for="recCategory" class="block text-sm text-slate-300 mb-1">{{ 'finance.category' | translate }}</label>
            <select id="recCategory" name="recCategory" [(ngModel)]="categoryId"
              class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2">
              <option [ngValue]="null">{{ 'finance.noCategory' | translate }}</option>
              @for (cat of categoriesForKind(); track cat.id) {
                <option [ngValue]="cat.id">{{ cat.name }}</option>
              }
            </select>
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="recActive" [(ngModel)]="isActive" class="accent-indigo-500" />
            {{ 'recurringForm.active' | translate }}
          </label>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" (click)="closed.emit()"
              class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              {{ 'common.cancel' | translate }}
            </button>
            <button type="submit" [disabled]="saving()"
              class="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
              {{ (saving() ? 'common.saving' : 'common.save') | translate }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class RecurringFormModal {
  private readonly api = inject(FinanceApiService);
  private readonly translate = inject(TranslateService);

  readonly recurring = input<RecurringTransaction | null>(null);
  readonly categories = input.required<Category[]>();
  readonly closed = output<void>();
  readonly saved = output<void>();

  readonly kind = signal<'income' | 'expense'>('expense');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  description = '';
  amount: number | null = null;
  dayOfMonth = 1;
  startMonth = toIsoDate(new Date()).slice(0, 7); // yyyy-MM for <input type="month">
  endMonth = '';
  categoryId: number | null = null;
  isActive = true;

  readonly categoriesForKind = computed(() =>
    this.categories().filter((c) => c.kind === this.kind()),
  );

  ngOnInit(): void {
    const rec = this.recurring();
    if (!rec) return;
    this.kind.set(rec.kind);
    this.description = rec.description;
    this.amount = rec.amount;
    this.dayOfMonth = rec.day_of_month;
    this.startMonth = rec.start_month.slice(0, 7);
    this.endMonth = rec.end_month?.slice(0, 7) ?? '';
    this.categoryId = rec.category_id;
    this.isActive = rec.is_active;
  }

  setKind(kind: 'income' | 'expense'): void {
    if (this.kind() === kind) return;
    this.kind.set(kind);
    this.categoryId = null; // categories are kind-specific
  }

  submit(): void {
    if (!this.description.trim() || !this.amount || this.amount <= 0 || !this.startMonth) {
      this.error.set(this.translate.instant('recurringForm.errors.required'));
      return;
    }
    if (this.dayOfMonth < 1 || this.dayOfMonth > 31) {
      this.error.set(this.translate.instant('recurringForm.errors.day'));
      return;
    }
    const payload: RecurringPayload = {
      kind: this.kind(),
      amount: this.amount,
      description: this.description.trim(),
      day_of_month: this.dayOfMonth,
      start_month: `${this.startMonth}-01`,
      end_month: this.endMonth ? `${this.endMonth}-01` : null,
      category_id: this.categoryId,
      is_active: this.isActive,
    };
    this.saving.set(true);
    this.error.set(null);
    const rec = this.recurring();
    const request = rec ? this.api.updateRecurring(rec.id, payload) : this.api.createRecurring(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('recurringForm.errors.save')));
      },
    });
  }
}
