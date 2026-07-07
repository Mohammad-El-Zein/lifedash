import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MealsApiService } from '../../core/api/meals-api.service';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import { MEAL_TYPES, Meal, MealPayload, MealType } from '../../core/models';
import { FxModal, staggerTilesSoon } from '../../shared/animations';

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-meals-page',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, FxModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'meals.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">{{ dayLabel() }}</p>
      </div>
      <button (click)="openForm(null)"
        class="inline-flex items-center gap-1.5 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
        <lucide-icon name="plus" [size]="16" /> {{ 'meals.addMeal' | translate }}
      </button>
    </header>

    <!-- Day navigation -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <button (click)="shiftDay(-1)" [title]="'meals.prevDay' | translate"
        class="rounded-control border border-edge-strong p-2 text-ink-soft hover:bg-field transition-colors">
        <lucide-icon name="chevron-left" [size]="16" />
      </button>
      <input type="date" name="day" [ngModel]="day()" (ngModelChange)="setDay($event)"
        class="rounded-control bg-field border border-edge-strong px-3 py-1.5 text-sm" />
      <button (click)="shiftDay(1)" [title]="'meals.nextDay' | translate"
        class="rounded-control border border-edge-strong p-2 text-ink-soft hover:bg-field transition-colors">
        <lucide-icon name="chevron-right" [size]="16" />
      </button>
      @if (day() !== today) {
        <button (click)="setDay(today)"
          class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field transition-colors">
          {{ 'common.today' | translate }}
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else {
      <!-- Day totals -->
      <div class="grid gap-4 sm:grid-cols-3 mb-6">
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted inline-flex items-center gap-1.5">
            <lucide-icon name="flame" [size]="14" /> {{ 'meals.totalCalories' | translate }}
          </p>
          <p class="text-2xl font-semibold mt-1 tabular-nums">{{ totals().calories }} kcal</p>
        </div>
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'meals.totalProtein' | translate }}</p>
          <p class="text-2xl font-semibold mt-1 tabular-nums">{{ totals().protein }} g</p>
        </div>
        <div data-tile class="rounded-card border border-edge bg-card p-5">
          <p class="text-sm text-ink-muted">{{ 'meals.totalCarbs' | translate }}</p>
          <p class="text-2xl font-semibold mt-1 tabular-nums">{{ totals().carbs }} g</p>
        </div>
      </div>

      @if (meals().length === 0) {
        <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
          {{ 'meals.noMeals' | translate }}
        </div>
      } @else {
        <div class="space-y-4">
          @for (group of grouped(); track group.type.value) {
            <div data-tile class="rounded-card border border-edge bg-card p-5">
              <div class="flex items-center justify-between mb-3">
                <h2 class="font-semibold inline-flex items-center gap-2">
                  <span class="icon-chip"><lucide-icon [name]="group.type.icon" [size]="16" /></span>
                  {{ group.type.labelKey | translate }}
                </h2>
                <span class="text-sm text-ink-muted tabular-nums">{{ group.calories }} kcal</span>
              </div>
              <ul class="space-y-1.5">
                @for (meal of group.meals; track meal.id) {
                  <li class="flex items-center gap-3 text-sm rounded-control border border-edge px-3 py-2">
                    <span class="min-w-0 flex-1 truncate">{{ meal.name }}</span>
                    @if (meal.protein_g !== null) {
                      <span class="text-xs text-ink-faint bg-field rounded px-1.5 py-0.5 shrink-0">
                        {{ 'meals.proteinShort' | translate: { g: meal.protein_g } }}
                      </span>
                    }
                    @if (meal.carbs_g !== null) {
                      <span class="text-xs text-ink-faint bg-field rounded px-1.5 py-0.5 shrink-0">
                        {{ 'meals.carbsShort' | translate: { g: meal.carbs_g } }}
                      </span>
                    }
                    <span class="tabular-nums text-ink-soft shrink-0 w-20 text-right">{{ meal.calories }} kcal</span>
                    <button (click)="openForm(meal)" [title]="'common.edit' | translate"
                      class="text-ink-faint hover:text-ink px-1 shrink-0"><lucide-icon name="pencil" [size]="15" /></button>
                    <button (click)="remove(meal)" [title]="'common.delete' | translate"
                      class="text-ink-faint hover:text-danger px-1 shrink-0"><lucide-icon name="trash-2" [size]="15" /></button>
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }
    }

    <!-- Add/edit modal -->
    @if (showForm()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showForm.set(false)">
        <div class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">
            {{ (editing() ? 'meals.form.editTitle' : 'meals.form.newTitle') | translate }}
          </h2>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submit()">
            <div class="grid grid-cols-2 gap-2">
              @for (t of mealTypes; track t.value) {
                <button type="button" (click)="fType = t.value"
                  [class]="'flex items-center gap-2 rounded-control border px-3 py-2 text-sm text-left transition-colors ' +
                    (fType === t.value ? 'border-accent bg-nav-active' : 'border-edge-strong hover:bg-field-soft')">
                  <lucide-icon [name]="t.icon" [size]="15" /> {{ t.labelKey | translate }}
                </button>
              }
            </div>
            <div>
              <label for="mealName" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.name' | translate }}</label>
              <input id="mealName" name="mealName" required [(ngModel)]="fName"
                [placeholder]="'meals.form.namePlaceholder' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label for="mealCalories" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.calories' | translate }}</label>
                <input id="mealCalories" name="mealCalories" type="number" min="0" max="10000" required
                  [(ngModel)]="fCalories" class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
              <div>
                <label for="mealProtein" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.protein' | translate }}</label>
                <input id="mealProtein" name="mealProtein" type="number" min="0" max="1000"
                  [(ngModel)]="fProtein" [placeholder]="'common.optional' | translate"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
              <div>
                <label for="mealCarbs" class="block text-sm text-ink-soft mb-1">{{ 'meals.form.carbs' | translate }}</label>
                <input id="mealCarbs" name="mealCarbs" type="number" min="0" max="1000"
                  [(ngModel)]="fCarbs" [placeholder]="'common.optional' | translate"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 tabular-nums" />
              </div>
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
export class MealsPage {
  private readonly api = inject(MealsApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly mealTypes = MEAL_TYPES;
  readonly today = toIsoDate(new Date());

  readonly day = signal(this.today);
  readonly loading = signal(true);
  readonly meals = signal<Meal[]>([]);

  readonly showForm = signal(false);
  readonly editing = signal<Meal | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  fType: MealType = 'breakfast';
  fName = '';
  fCalories: number | null = null;
  fProtein: number | null = null;
  fCarbs: number | null = null;

  readonly totals = computed(() => ({
    calories: this.meals().reduce((sum, m) => sum + m.calories, 0),
    protein: this.meals().reduce((sum, m) => sum + (m.protein_g ?? 0), 0),
    carbs: this.meals().reduce((sum, m) => sum + (m.carbs_g ?? 0), 0),
  }));

  readonly grouped = computed(() =>
    MEAL_TYPES.map((type) => {
      const meals = this.meals().filter((m) => m.meal_type === type.value);
      return { type, meals, calories: meals.reduce((sum, m) => sum + m.calories, 0) };
    }).filter((group) => group.meals.length > 0),
  );

  readonly dayLabel = computed(() =>
    new Date(`${this.day()}T00:00:00`).toLocaleDateString(this.language.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list(this.day()).subscribe({
      next: (meals) => {
        this.meals.set(meals);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: () => this.loading.set(false),
    });
  }

  setDay(day: string): void {
    if (!day) return;
    this.day.set(day);
    this.load();
  }

  shiftDay(delta: number): void {
    const date = new Date(`${this.day()}T00:00:00`);
    date.setDate(date.getDate() + delta);
    this.setDay(toIsoDate(date));
  }

  openForm(meal: Meal | null): void {
    this.editing.set(meal);
    this.error.set(null);
    this.fType = meal?.meal_type ?? 'breakfast';
    this.fName = meal?.name ?? '';
    this.fCalories = meal?.calories ?? null;
    this.fProtein = meal?.protein_g ?? null;
    this.fCarbs = meal?.carbs_g ?? null;
    this.showForm.set(true);
  }

  submit(): void {
    if (!this.fName.trim() || this.fCalories === null || this.fCalories < 0) {
      this.error.set(this.translate.instant('meals.errors.required'));
      return;
    }
    const payload: MealPayload = {
      date: this.day(),
      meal_type: this.fType,
      name: this.fName.trim(),
      calories: this.fCalories,
      protein_g: this.fProtein,
      carbs_g: this.fCarbs,
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.editing();
    const req = editing ? this.api.update(editing.id, payload) : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('meals.errors.save')));
      },
    });
  }

  remove(meal: Meal): void {
    if (!confirm(this.translate.instant('meals.deleteConfirm', { name: meal.name }))) return;
    this.api.delete(meal.id).subscribe({ next: () => this.load() });
  }
}
