import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { eur } from '../../core/format';
import { extractError } from '../../core/http-error';
import { SavingsOverview } from '../../core/models';

@Component({
  selector: 'app-savings-tab',
  imports: [FormsModule],
  template: `
    @if (loading()) {
      <p class="text-slate-400">Loading…</p>
    } @else if (overview(); as o) {
      @if (error()) {
        <p class="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 mb-4">
          {{ error() }}
        </p>
      }

      <div class="grid gap-6 lg:grid-cols-3 mb-6">
        <!-- Cumulative progress -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
          <h2 class="font-semibold mb-1">Savings since {{ o.start_month.slice(0, 7) }}</h2>
          <p class="text-3xl font-semibold mt-2 tabular-nums">
            {{ eur(o.saved_total) }}
            <span class="text-slate-400 text-xl font-normal">/ {{ eur(o.target_total) }} saved</span>
          </p>
          <p class="mt-1 text-sm" [class]="o.delta_total >= 0 ? 'text-emerald-400' : 'text-red-400'">
            {{ o.delta_total >= 0 ? '+' : '' }}{{ eur(o.delta_total) }} vs. the cumulative goal
            ({{ o.months.length }} × {{ eur(o.monthly_target) }})
          </p>
          <div class="h-3 rounded-full bg-slate-800 overflow-hidden mt-4">
            <div
              class="h-full rounded-full"
              [class]="o.delta_total >= 0 ? 'bg-emerald-500' : 'bg-amber-500'"
              [style.width.%]="progressPct()"
            ></div>
          </div>
        </div>

        <!-- Settings -->
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 class="font-semibold mb-4">Goal settings</h2>
          <div class="space-y-3">
            <div>
              <label for="savTarget" class="block text-sm text-slate-300 mb-1">Monthly target (€)</label>
              <input id="savTarget" name="savTarget" type="number" min="0" step="10"
                [(ngModel)]="pendingTarget"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <div>
              <label for="savStart" class="block text-sm text-slate-300 mb-1">Tracking starts</label>
              <input id="savStart" name="savStart" type="month" [(ngModel)]="pendingStart"
                class="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2" />
            </div>
            <button (click)="saveSettings()" [disabled]="saving()"
              class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium">
              {{ saving() ? 'Saving…' : 'Save settings' }}
            </button>
            <p class="text-xs text-slate-500">
              The target applies to all months, including past ones.
            </p>
          </div>
        </div>
      </div>

      <!-- Per-month breakdown -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <h2 class="font-semibold px-5 pt-5 pb-3">Month by month</h2>
        @if (o.months.length === 0) {
          <p class="text-sm text-slate-500 px-5 pb-6">
            Tracking starts in a future month — nothing to show yet.
          </p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-slate-400 border-t border-slate-800">
                  <th class="px-5 py-2.5 font-medium">Month</th>
                  <th class="px-5 py-2.5 font-medium text-right">Income</th>
                  <th class="px-5 py-2.5 font-medium text-right">Expenses</th>
                  <th class="px-5 py-2.5 font-medium text-right">Saved</th>
                  <th class="px-5 py-2.5 font-medium text-right">Target</th>
                  <th class="px-5 py-2.5 font-medium text-right">±</th>
                </tr>
              </thead>
              <tbody>
                @for (m of monthsNewestFirst(); track m.month) {
                  <tr class="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td class="px-5 py-2.5 text-slate-300 tabular-nums">
                      {{ m.month.slice(0, 7) }}
                      @if (m.is_current) {
                        <span class="ml-2 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 px-2 py-0.5 text-xs">in progress</span>
                      }
                    </td>
                    <td class="px-5 py-2.5 text-right tabular-nums text-slate-300">{{ eur(m.income) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums text-slate-300">{{ eur(m.expenses) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums font-medium">{{ eur(m.saved) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums text-slate-400">{{ eur(m.target) }}</td>
                    <td class="px-5 py-2.5 text-right tabular-nums font-medium"
                      [class]="m.delta >= 0 ? 'text-emerald-400' : 'text-red-400'">
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
        this.error.set(extractError(err, 'Could not load the savings overview.'));
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
      this.error.set('Please enter a target of 0 or more and a start month.');
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
          this.error.set(extractError(err, 'Could not save the settings.'));
        },
      });
  }
}
