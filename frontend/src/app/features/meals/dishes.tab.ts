import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MealsApiService } from '../../core/api/meals-api.service';
import { extractError } from '../../core/http-error';
import {
  Ingredient,
  MealTemplate,
  TemplatePayload,
  TemplateUnit,
} from '../../core/models';
import { FxModal } from '../../shared/animations';

interface ItemRow {
  ingredient_id: number | null;
  unit: TemplateUnit;
  amount: number | null;
}

@Component({
  selector: 'app-dishes-tab',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, FxModal],
  template: `
    <div class="flex items-center justify-between mb-4">
      <p class="text-ink-muted text-sm">{{ 'meals.dishes.hint' | translate }}</p>
      <button (click)="openForm(null)"
        class="inline-flex items-center gap-1.5 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
        <lucide-icon name="plus" [size]="16" /> {{ 'meals.dishes.add' | translate }}
      </button>
    </div>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (templates().length === 0) {
      <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
        {{ 'meals.dishes.empty' | translate }}
      </div>
    } @else {
      <div class="grid gap-4 md:grid-cols-2">
        @for (tpl of templates(); track tpl.id) {
          <div class="rounded-card border border-edge bg-card p-5">
            <div class="flex items-start justify-between gap-3 mb-2">
              <h2 class="font-semibold text-lg inline-flex items-center gap-2 min-w-0">
                <span class="icon-chip shrink-0"><lucide-icon name="utensils" [size]="15" /></span>
                <span class="truncate">{{ tpl.name }}</span>
              </h2>
              <div class="flex items-center gap-1 shrink-0">
                <button (click)="openForm(tpl)" [title]="'common.edit' | translate"
                  class="text-ink-faint hover:text-ink px-1"><lucide-icon name="pencil" [size]="15" /></button>
                <button (click)="remove(tpl)" [title]="'common.delete' | translate"
                  class="text-ink-faint hover:text-danger px-1"><lucide-icon name="trash-2" [size]="15" /></button>
              </div>
            </div>
            <ul class="text-sm text-ink-soft space-y-1 mb-3">
              @for (item of tpl.items; track item.id) {
                <li class="flex items-baseline justify-between gap-3">
                  <span class="min-w-0 truncate">
                    {{ item.ingredient_name }}
                    <span class="text-ink-faint">
                      · {{ item.unit === 'piece' ? num(item.amount) + '× (' + num(item.grams) + ' g)' : num(item.grams) + ' g' }}
                    </span>
                  </span>
                  <span class="tabular-nums text-ink-faint shrink-0">{{ num(item.calories) }} kcal</span>
                </li>
              }
            </ul>
            <div class="border-t border-edge pt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span class="font-semibold text-base tabular-nums">{{ num(tpl.totals.calories) }} kcal</span>
              <span class="text-ink-muted tabular-nums">P {{ num(tpl.totals.protein_g) }} g</span>
              <span class="text-ink-muted tabular-nums">KH {{ num(tpl.totals.carbs_g) }} g</span>
              <span class="text-ink-muted tabular-nums">F {{ num(tpl.totals.fat_g) }} g</span>
            </div>
          </div>
        }
      </div>
    }

    <!-- Builder modal -->
    @if (showForm()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showForm.set(false)">
        <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-card border border-edge-strong bg-card p-6 shadow-modal"
          fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">
            {{ (editing() ? 'meals.dishes.editTitle' : 'meals.dishes.addTitle') | translate }}
          </h2>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submit()">
            <div>
              <label for="dishName" class="block text-sm text-ink-soft mb-1">{{ 'meals.dishes.name' | translate }}</label>
              <input id="dishName" name="dishName" required [(ngModel)]="fName"
                [placeholder]="'meals.dishes.namePlaceholder' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="block text-sm font-medium text-ink-soft">{{ 'meals.dishes.ingredients' | translate }}</span>
                <button type="button" (click)="addRow()" [disabled]="ingredients().length === 0"
                  class="inline-flex items-center gap-1 rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field disabled:opacity-50">
                  <lucide-icon name="plus" [size]="14" /> {{ 'meals.dishes.addIngredient' | translate }}
                </button>
              </div>
              @if (ingredients().length === 0) {
                <p class="text-sm text-ink-faint rounded-control border border-edge px-3 py-2">
                  {{ 'meals.dishes.noIngredients' | translate }}
                </p>
              } @else if (rows().length === 0) {
                <p class="text-sm text-ink-faint rounded-control border border-edge px-3 py-2">
                  {{ 'meals.dishes.noRows' | translate }}
                </p>
              }
              <div class="space-y-2">
                @for (row of rows(); track $index; let i = $index) {
                  <div class="flex items-center gap-2">
                    <select required [ngModel]="row.ingredient_id" [name]="'dishIngredient' + i"
                      (ngModelChange)="patchRow(i, { ingredient_id: $event, unit: unitFor($event, row.unit) })"
                      class="min-w-0 flex-1 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm">
                      <option [ngValue]="null" disabled>{{ 'meals.dishes.ingredient' | translate }}</option>
                      @for (ing of ingredients(); track ing.id) {
                        <option [ngValue]="ing.id">{{ ing.name }}</option>
                      }
                    </select>
                    <input type="number" min="0.1" max="100000" step="0.1" required
                      [ngModel]="row.amount" [name]="'dishAmount' + i"
                      (ngModelChange)="patchRow(i, { amount: $event })"
                      [placeholder]="'meals.dishes.amount' | translate"
                      class="w-24 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm tabular-nums" />
                    <div class="flex rounded-control border border-edge-strong overflow-hidden shrink-0">
                      <button type="button" (click)="patchRow(i, { unit: 'g' })"
                        [class]="unitClass(row.unit === 'g')">g</button>
                      <button type="button" (click)="patchRow(i, { unit: 'piece' })"
                        [disabled]="!pieceAllowed(row.ingredient_id)"
                        [title]="pieceAllowed(row.ingredient_id) ? '' : ('meals.dishes.pieceUnavailable' | translate)"
                        [class]="unitClass(row.unit === 'piece') + ' disabled:opacity-40 disabled:cursor-not-allowed'">
                        {{ 'meals.dishes.pieces' | translate }}
                      </button>
                    </div>
                    <span class="w-20 text-right text-xs text-ink-faint tabular-nums shrink-0">
                      @if (rowGrams(row) !== null) { {{ rowGrams(row) }} g }
                    </span>
                    <button type="button" (click)="removeRow(i)" [title]="'common.delete' | translate"
                      class="text-ink-faint hover:text-danger px-1 shrink-0"><lucide-icon name="trash-2" [size]="15" /></button>
                  </div>
                }
              </div>
            </div>

            <!-- Live totals preview -->
            <div class="rounded-control border border-edge bg-field-soft px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span class="text-ink-muted">{{ 'meals.dishes.preview' | translate }}</span>
              <span class="font-semibold text-base tabular-nums">{{ preview().calories }} kcal</span>
              <span class="text-ink-muted tabular-nums">P {{ preview().protein }} g</span>
              <span class="text-ink-muted tabular-nums">KH {{ preview().carbs }} g</span>
              <span class="text-ink-muted tabular-nums">F {{ preview().fat }} g</span>
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showForm.set(false)"
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
export class DishesTab {
  private readonly api = inject(MealsApiService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly templates = signal<MealTemplate[]>([]);
  readonly ingredients = signal<Ingredient[]>([]);
  readonly showForm = signal(false);
  readonly editing = signal<MealTemplate | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly rows = signal<ItemRow[]>([]);

  fName = '';

  private readonly ingredientById = computed(
    () => new Map(this.ingredients().map((i) => [i.id, i])),
  );

  readonly preview = computed(() => {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    for (const row of this.rows()) {
      const grams = this.rowGrams(row);
      const ing = row.ingredient_id === null ? undefined : this.ingredientById().get(row.ingredient_id);
      if (grams === null || !ing) continue;
      const factor = grams / 100;
      calories += Number(ing.calories_per_100g) * factor;
      protein += Number(ing.protein_per_100g) * factor;
      carbs += Number(ing.carbs_per_100g) * factor;
      fat += Number(ing.fat_per_100g) * factor;
    }
    const round = (v: number) => Math.round(v * 10) / 10;
    return { calories: round(calories), protein: round(protein), carbs: round(carbs), fat: round(fat) };
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.listTemplates().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.listIngredients().subscribe({
      next: (ingredients) => this.ingredients.set(ingredients),
    });
  }

  num(value: string): number {
    return Number(value);
  }

  rowGrams(row: ItemRow): number | null {
    if (row.ingredient_id === null || row.amount === null || row.amount <= 0) return null;
    if (row.unit === 'g') return Math.round(row.amount * 10) / 10;
    const ing = this.ingredientById().get(row.ingredient_id);
    if (!ing || ing.piece_grams === null) return null;
    return Math.round(row.amount * Number(ing.piece_grams) * 10) / 10;
  }

  pieceAllowed(ingredientId: number | null): boolean {
    if (ingredientId === null) return false;
    return this.ingredientById().get(ingredientId)?.piece_grams != null;
  }

  unitFor(ingredientId: number | null, current: TemplateUnit): TemplateUnit {
    return current === 'piece' && !this.pieceAllowed(ingredientId) ? 'g' : current;
  }

  unitClass(active: boolean): string {
    return (
      'px-2.5 py-2 text-xs transition-colors ' +
      (active ? 'bg-pill text-white font-medium' : 'text-ink-muted hover:text-ink')
    );
  }

  addRow(): void {
    this.rows.update((rows) => [
      ...rows,
      { ingredient_id: this.ingredients()[0]?.id ?? null, unit: 'g', amount: null },
    ]);
  }

  removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  patchRow(index: number, patch: Partial<ItemRow>): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  openForm(template: MealTemplate | null): void {
    this.editing.set(template);
    this.error.set(null);
    this.fName = template?.name ?? '';
    this.rows.set(
      (template?.items ?? []).map((item) => ({
        ingredient_id: item.ingredient_id,
        unit: item.unit,
        amount: Number(item.amount),
      })),
    );
    this.showForm.set(true);
  }

  submit(): void {
    const rows = this.rows();
    if (!this.fName.trim() || rows.length === 0) {
      this.error.set(this.translate.instant('meals.dishes.errors.required'));
      return;
    }
    if (rows.some((r) => r.ingredient_id === null || r.amount === null || r.amount <= 0)) {
      this.error.set(this.translate.instant('meals.dishes.errors.incompleteRows'));
      return;
    }
    const payload: TemplatePayload = {
      name: this.fName.trim(),
      items: rows.map((r) => ({
        ingredient_id: r.ingredient_id!,
        unit: r.unit,
        amount: r.amount!,
      })),
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.editing();
    const req = editing
      ? this.api.updateTemplate(editing.id, payload)
      : this.api.createTemplate(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('meals.dishes.errors.save')));
      },
    });
  }

  remove(template: MealTemplate): void {
    if (!confirm(this.translate.instant('meals.dishes.deleteConfirm', { name: template.name })))
      return;
    this.api.deleteTemplate(template.id).subscribe({ next: () => this.load() });
  }
}
