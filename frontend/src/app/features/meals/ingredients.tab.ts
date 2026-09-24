import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MealsApiService } from '../../core/api/meals-api.service';
import { extractError } from '../../core/http-error';
import { Ingredient, IngredientPayload } from '../../core/models';
import { FxModal } from '../../shared/animations';

@Component({
  selector: 'app-ingredients-tab',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, FxModal],
  template: `
    <div class="flex items-center justify-between mb-4">
      <p class="text-ink-muted text-sm">{{ 'meals.ingredients.hint' | translate }}</p>
      <button (click)="openForm(null)"
        class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-accent hover:bg-accent-hover px-4 text-sm font-medium transition-colors">
        <lucide-icon name="plus" [size]="16" /> {{ 'meals.ingredients.add' | translate }}
      </button>
    </div>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (ingredients().length === 0) {
      <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
        {{ 'meals.ingredients.empty' | translate }}
      </div>
    } @else {
      <!-- Seven nutrient columns per ingredient; below sm each becomes a card. -->
      <ul class="divide-y divide-edge rounded-card border border-edge bg-card sm:hidden">
        @for (ing of ingredients(); track ing.id) {
          <li class="px-4 py-3">
            <div class="flex items-baseline justify-between gap-3">
              <span class="min-w-0 truncate font-medium">{{ ing.name }}</span>
              <span class="shrink-0 tabular-nums font-semibold">{{ num(ing.calories_per_100g) }} kcal</span>
            </div>
            <p class="mt-1 text-xs text-ink-muted tabular-nums">
              {{ 'meals.ingredients.per100g' | translate }}
              <span aria-hidden="true">·</span>
              {{ 'meals.protein' | translate }} {{ num(ing.protein_per_100g) }} g
              <span aria-hidden="true">·</span>
              {{ 'meals.carbs' | translate }} {{ num(ing.carbs_per_100g) }} g
              <span aria-hidden="true">·</span>
              {{ 'meals.fat' | translate }} {{ num(ing.fat_per_100g) }} g
            </p>
            <div class="mt-1 flex items-center gap-2">
              @if (ing.piece_grams !== null) {
                <span class="text-xs text-ink-faint tabular-nums">
                  {{ 'meals.ingredients.pieceGrams' | translate }} {{ num(ing.piece_grams) }} g
                </span>
              }
              <span class="flex-1"></span>
              <button
                (click)="openForm(ing)"
                class="flex h-11 w-11 items-center justify-center rounded-control text-ink-faint hover:bg-field hover:text-ink"
                [attr.aria-label]="'common.edit' | translate"
              >
                <lucide-icon name="pencil" [size]="16" />
              </button>
              <button
                (click)="remove(ing)"
                class="flex h-11 w-11 items-center justify-center rounded-control text-ink-faint hover:bg-field hover:text-danger"
                [attr.aria-label]="'common.delete' | translate"
              >
                <lucide-icon name="trash-2" [size]="16" />
              </button>
            </div>
          </li>
        }
      </ul>

      <div class="hidden rounded-card border border-edge bg-card overflow-hidden sm:block">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-ink-muted border-b border-edge">
                <th class="px-5 py-3 font-medium">{{ 'meals.ingredients.name' | translate }}</th>
                <th class="px-5 py-3 font-medium text-right">kcal / 100 g</th>
                <th class="px-5 py-3 font-medium text-right">{{ 'meals.protein' | translate }}</th>
                <th class="px-5 py-3 font-medium text-right">{{ 'meals.carbs' | translate }}</th>
                <th class="px-5 py-3 font-medium text-right">{{ 'meals.fat' | translate }}</th>
                <th class="px-5 py-3 font-medium text-right">{{ 'meals.ingredients.pieceGrams' | translate }}</th>
                <th class="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              @for (ing of ingredients(); track ing.id) {
                <tr class="border-b border-edge last:border-0">
                  <td class="px-5 py-2.5 font-medium">{{ ing.name }}</td>
                  <td class="px-5 py-2.5 text-right tabular-nums">{{ num(ing.calories_per_100g) }}</td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">{{ num(ing.protein_per_100g) }} g</td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">{{ num(ing.carbs_per_100g) }} g</td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">{{ num(ing.fat_per_100g) }} g</td>
                  <td class="px-5 py-2.5 text-right tabular-nums text-ink-soft">
                    @if (ing.piece_grams !== null) { {{ num(ing.piece_grams) }} g } @else { <span class="text-ink-faint">—</span> }
                  </td>
                  <td class="px-5 py-2.5 text-right whitespace-nowrap">
                    <button (click)="openForm(ing)" [title]="'common.edit' | translate"
                      class="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-faint hover:bg-field hover:text-ink"><lucide-icon name="pencil" [size]="15" /></button>
                    <button (click)="remove(ing)" [title]="'common.delete' | translate"
                      class="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-faint hover:bg-field hover:text-danger"><lucide-icon name="trash-2" [size]="15" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
    @if (listError()) {
      <p class="fx-pop mt-3 text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2">
        {{ listError() }}
      </p>
    }

    <!-- Add/edit modal -->
    @if (showForm()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-end justify-center bg-backdrop p-4 sm:items-center" (click)="showForm.set(false)">
        <div class="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-card border border-edge-strong bg-card p-5 shadow-modal sm:p-6" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-1">
            {{ (editing() ? 'meals.ingredients.editTitle' : 'meals.ingredients.addTitle') | translate }}
          </h2>
          <p class="text-sm text-ink-muted mb-4">{{ 'meals.ingredients.per100g' | translate }}</p>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submit()">
            <div>
              <label for="ingName" class="block text-sm text-ink-soft mb-1">{{ 'meals.ingredients.name' | translate }}</label>
              <input id="ingName" name="ingName" required [(ngModel)]="fName"
                [placeholder]="'meals.ingredients.namePlaceholder' | translate"
                class="min-h-11 w-full rounded-control bg-field border border-edge-strong px-3" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="ingKcal" class="block text-sm text-ink-soft mb-1">kcal</label>
                <input id="ingKcal" name="ingKcal" type="number" min="0" max="1000" step="0.1" required
                  [(ngModel)]="fCalories" class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
              <div>
                <label for="ingProtein" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.protein' | translate }}</label>
                <input id="ingProtein" name="ingProtein" type="number" min="0" max="100" step="0.1" required
                  [(ngModel)]="fProtein" class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
              <div>
                <label for="ingCarbs" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.carbs' | translate }}</label>
                <input id="ingCarbs" name="ingCarbs" type="number" min="0" max="100" step="0.1" required
                  [(ngModel)]="fCarbs" class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
              <div>
                <label for="ingFat" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.fat' | translate }}</label>
                <input id="ingFat" name="ingFat" type="number" min="0" max="100" step="0.1" required
                  [(ngModel)]="fFat" class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
            </div>
            <div>
              <label for="ingPiece" class="block text-sm text-ink-soft mb-1">
                {{ 'meals.ingredients.pieceGramsLabel' | translate }}
              </label>
              <input id="ingPiece" name="ingPiece" type="number" min="0.1" max="10000" step="0.1"
                [(ngModel)]="fPieceGrams" [placeholder]="'common.optional' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              <p class="text-xs text-ink-faint mt-1">{{ 'meals.ingredients.pieceGramsHint' | translate }}</p>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showForm.set(false)"
                class="min-h-11 rounded-control border border-edge-strong px-4 text-sm text-ink-soft hover:bg-field">
                {{ 'common.cancel' | translate }}
              </button>
              <button type="submit" [disabled]="saving()"
                class="min-h-11 rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 text-sm font-medium">
                {{ (saving() ? 'common.saving' : 'common.save') | translate }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class IngredientsTab {
  private readonly api = inject(MealsApiService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly ingredients = signal<Ingredient[]>([]);
  readonly showForm = signal(false);
  readonly editing = signal<Ingredient | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly listError = signal<string | null>(null);

  fName = '';
  fCalories: number | null = null;
  fProtein: number | null = null;
  fCarbs: number | null = null;
  fFat: number | null = null;
  fPieceGrams: number | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.listIngredients().subscribe({
      next: (ingredients) => {
        this.ingredients.set(ingredients);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  num(value: string): number {
    return Number(value);
  }

  openForm(ingredient: Ingredient | null): void {
    this.editing.set(ingredient);
    this.error.set(null);
    this.fName = ingredient?.name ?? '';
    this.fCalories = ingredient ? Number(ingredient.calories_per_100g) : null;
    this.fProtein = ingredient ? Number(ingredient.protein_per_100g) : null;
    this.fCarbs = ingredient ? Number(ingredient.carbs_per_100g) : null;
    this.fFat = ingredient ? Number(ingredient.fat_per_100g) : null;
    this.fPieceGrams = ingredient?.piece_grams !== null && ingredient !== null
      ? Number(ingredient.piece_grams)
      : null;
    this.showForm.set(true);
  }

  submit(): void {
    if (
      !this.fName.trim() ||
      this.fCalories === null ||
      this.fProtein === null ||
      this.fCarbs === null ||
      this.fFat === null
    ) {
      this.error.set(this.translate.instant('meals.ingredients.errors.required'));
      return;
    }
    const payload: IngredientPayload = {
      name: this.fName.trim(),
      calories_per_100g: this.fCalories,
      protein_per_100g: this.fProtein,
      carbs_per_100g: this.fCarbs,
      fat_per_100g: this.fFat,
      piece_grams: this.fPieceGrams,
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.editing();
    const req = editing
      ? this.api.updateIngredient(editing.id, payload)
      : this.api.createIngredient(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('meals.ingredients.errors.save')));
      },
    });
  }

  remove(ingredient: Ingredient): void {
    if (!confirm(this.translate.instant('meals.deleteConfirm', { name: ingredient.name }))) return;
    this.listError.set(null);
    this.api.deleteIngredient(ingredient.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.listError.set(
          extractError(err, this.translate.instant('meals.ingredients.errors.inUse')),
        );
      },
    });
  }
}
