import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';
import { Observable, switchMap } from 'rxjs';
import { CalendarApiService } from '../../core/api/calendar-api.service';
import { CaptureApiService } from '../../core/api/capture-api.service';
import { FinanceApiService } from '../../core/api/finance-api.service';
import { JobsApiService } from '../../core/api/jobs-api.service';
import { MealsApiService } from '../../core/api/meals-api.service';
import { extractError } from '../../core/http-error';
import { SpeechService } from '../../core/speech/speech.service';
import {
  CATEGORY_COLORS,
  Category,
  CaptureSuggestion,
  JOB_STATUSES,
  MEAL_TYPES,
  MealType,
  JobStatus,
} from '../../core/models';
import { FxModal } from '../../shared/animations';

type Phase = 'input' | 'review' | 'saved';

/** Sentinel for "create the category the model proposed" in the select. */
const NEW_CATEGORY = -1;

@Component({
  selector: 'app-quick-capture',
  imports: [FormsModule, RouterLink, TranslatePipe, LucideAngularModule, FxModal],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <button
      type="button"
      (click)="openCapture()"
      class="fx-pop fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-modal transition-colors hover:bg-accent-hover"
      [title]="'capture.open' | translate"
      [attr.aria-label]="'capture.open' | translate"
    >
      <lucide-icon name="mic" [size]="22" />
    </button>

    @if (open()) {
      <div
        class="fx-fade fixed inset-0 z-50 flex items-end justify-center bg-backdrop p-4 sm:items-center"
        (click)="close()"
      >
        <div
          class="w-full max-w-lg rounded-card border border-edge-strong bg-card p-6 shadow-modal"
          fxModal
          (click)="$event.stopPropagation()"
        >
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-semibold">{{ 'capture.title' | translate }}</h2>
              <p class="text-sm text-ink-muted">{{ 'capture.subtitle' | translate }}</p>
            </div>
            <button
              type="button"
              (click)="close()"
              class="rounded-control p-1 text-ink-faint hover:bg-field"
              [attr.aria-label]="'common.cancel' | translate"
            >
              <lucide-icon name="x" [size]="18" />
            </button>
          </div>

          @if (phase() === 'input') {
            <textarea
              rows="3"
              [ngModel]="text()"
              (ngModelChange)="text.set($event)"
              name="captureText"
              [placeholder]="'capture.placeholder' | translate"
              class="w-full rounded-control border border-edge-strong bg-field px-3 py-2 text-sm"
            ></textarea>

            @if (speech.interim(); as interim) {
              <p class="mt-1 text-sm text-ink-faint italic">{{ interim }}</p>
            }
            @if (speech.errorKey(); as key) {
              <p class="mt-1 text-sm text-danger">{{ key | translate }}</p>
            }
            @if (!speech.supported) {
              <p class="mt-1 text-xs text-ink-faint">{{ 'capture.speech.unsupported' | translate }}</p>
            }

            <div class="mt-4 flex items-center gap-2">
              @if (speech.supported) {
                <button
                  type="button"
                  (click)="toggleDictation()"
                  class="flex items-center gap-2 rounded-control border px-3 py-2 text-sm transition-colors"
                  [class.border-danger]="speech.listening()"
                  [class.text-danger]="speech.listening()"
                  [class.border-edge-strong]="!speech.listening()"
                  [class.text-ink-soft]="!speech.listening()"
                >
                  <lucide-icon [name]="speech.listening() ? 'square' : 'mic'" [size]="16" />
                  {{ (speech.listening() ? 'capture.stopDictation' : 'capture.dictate') | translate }}
                </button>
              }
              <span class="flex-1"></span>
              <button
                type="button"
                (click)="parse()"
                [disabled]="!canParse()"
                class="rounded-control bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {{ (parsing() ? 'capture.parsing' : 'capture.parse') | translate }}
              </button>
            </div>
          }

          @if (phase() === 'review') {
            <p class="mb-3 flex items-center gap-2 text-sm">
              <span class="rounded-pill bg-pill px-2 py-0.5 text-xs uppercase tracking-wide">
                {{ 'capture.modules.' + suggestion()!.module | translate }}
              </span>
              <span class="text-ink-faint text-xs">
                {{ 'capture.confidence.' + suggestion()!.confidence | translate }}
              </span>
            </p>
            <p class="mb-4 text-sm text-ink-soft">{{ suggestion()!.summary }}</p>

            @if (suggestion()!.module === 'unknown') {
              <p class="mb-4 rounded-control border border-edge bg-field px-3 py-2 text-sm text-ink-muted">
                {{ 'capture.unknownHint' | translate }}
              </p>
            }

            @if (form.kind === 'finance') {
              <div class="grid grid-cols-2 gap-3">
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.kind' | translate }}</span>
                  <select [(ngModel)]="form.finKind" name="finKind" class="w-full rounded-control border border-edge-strong bg-field px-3 py-2">
                    <option value="expense">{{ 'finance.expense' | translate }}</option>
                    <option value="income">{{ 'finance.income' | translate }}</option>
                  </select>
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.amount' | translate }}</span>
                  <input type="number" step="0.01" min="0" [(ngModel)]="form.amount" name="amount"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-2 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.description' | translate }}</span>
                  <input [(ngModel)]="form.description" name="description"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.date' | translate }}</span>
                  <input type="date" [(ngModel)]="form.date" name="date"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.category' | translate }}</span>
                  <select [(ngModel)]="form.categoryId" name="categoryId"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2">
                    <option [ngValue]="null">{{ 'capture.fields.noCategory' | translate }}</option>
                    @if (proposedCategory()) {
                      <option [ngValue]="newCategory">
                        {{ 'capture.fields.createCategory' | translate: { name: proposedCategory() } }}
                      </option>
                    }
                    @for (category of categories(); track category.id) {
                      <option [ngValue]="category.id">{{ category.name }}</option>
                    }
                  </select>
                </label>
              </div>
            }

            @if (form.kind === 'meal') {
              <div class="grid grid-cols-2 gap-3">
                <label class="col-span-2 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.name' | translate }}</span>
                  <input [(ngModel)]="form.name" name="name"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.mealType' | translate }}</span>
                  <select [(ngModel)]="form.mealType" name="mealType"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2">
                    @for (type of mealTypes; track type.value) {
                      <option [ngValue]="type.value">{{ type.labelKey | translate }}</option>
                    }
                  </select>
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.calories' | translate }}</span>
                  <input type="number" min="0" [(ngModel)]="form.calories" name="calories"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.protein' | translate }}</span>
                  <input type="number" min="0" [(ngModel)]="form.protein" name="protein"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.date' | translate }}</span>
                  <input type="date" [(ngModel)]="form.date" name="date"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
              </div>
            }

            @if (form.kind === 'event') {
              <div class="grid grid-cols-2 gap-3">
                <label class="col-span-2 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.title' | translate }}</span>
                  <input [(ngModel)]="form.title" name="title"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-2 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.date' | translate }}</span>
                  <input type="date" [(ngModel)]="form.date" name="date"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.start' | translate }}</span>
                  <input type="time" [(ngModel)]="form.start" name="start"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.end' | translate }}</span>
                  <input type="time" [(ngModel)]="form.end" name="end"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-2 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.location' | translate }}</span>
                  <input [(ngModel)]="form.location" name="location"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
              </div>
            }

            @if (form.kind === 'job') {
              <div class="grid grid-cols-2 gap-3">
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.company' | translate }}</span>
                  <input [(ngModel)]="form.company" name="company"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.position' | translate }}</span>
                  <input [(ngModel)]="form.position" name="position"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.status' | translate }}</span>
                  <select [(ngModel)]="form.status" name="status"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2">
                    @for (status of jobStatuses; track status.value) {
                      <option [ngValue]="status.value">{{ status.labelKey | translate }}</option>
                    }
                  </select>
                </label>
                <label class="col-span-1 text-sm">
                  <span class="mb-1 block text-ink-muted">{{ 'capture.fields.date' | translate }}</span>
                  <input type="date" [(ngModel)]="form.date" name="date"
                    class="w-full rounded-control border border-edge-strong bg-field px-3 py-2" />
                </label>
              </div>
            }

            @if (error(); as message) {
              <p class="mt-3 text-sm text-danger">{{ message }}</p>
            }

            <div class="mt-5 flex items-center gap-2">
              <button
                type="button"
                (click)="backToInput()"
                class="rounded-control border border-edge-strong px-3 py-2 text-sm text-ink-soft hover:bg-field"
              >
                {{ 'capture.editText' | translate }}
              </button>
              <span class="flex-1"></span>
              @if (form.kind !== 'none') {
                <button
                  type="button"
                  (click)="save()"
                  [disabled]="saving()"
                  class="rounded-control bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {{ (saving() ? 'common.saving' : 'capture.save') | translate }}
                </button>
              }
            </div>
          }

          @if (phase() === 'saved') {
            <div class="py-4 text-center">
              <lucide-icon name="check" [size]="32" class="mx-auto mb-2 text-success" />
              <p class="text-sm text-ink-soft">{{ 'capture.saved' | translate }}</p>
              <div class="mt-5 flex items-center justify-center gap-2">
                <button
                  type="button"
                  (click)="reset()"
                  class="rounded-control border border-edge-strong px-3 py-2 text-sm text-ink-soft hover:bg-field"
                >
                  {{ 'capture.captureAnother' | translate }}
                </button>
                @if (savedRoute(); as route) {
                  <a
                    [routerLink]="route"
                    (click)="close()"
                    class="rounded-control bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    {{ 'capture.openModule' | translate }}
                  </a>
                }
              </div>
            </div>
          }

          @if (phase() === 'input' && error(); as message) {
            <p class="mt-3 text-sm text-danger">{{ message }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class QuickCaptureComponent {
  private readonly api = inject(CaptureApiService);
  private readonly finance = inject(FinanceApiService);
  private readonly meals = inject(MealsApiService);
  private readonly calendar = inject(CalendarApiService);
  private readonly jobs = inject(JobsApiService);
  private readonly translate = inject(TranslateService);
  readonly speech = inject(SpeechService);

  readonly mealTypes = MEAL_TYPES;
  readonly jobStatuses = JOB_STATUSES;
  readonly newCategory = NEW_CATEGORY;

  readonly open = signal(false);
  readonly phase = signal<Phase>('input');
  readonly text = signal('');
  readonly parsing = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly suggestion = signal<CaptureSuggestion | null>(null);
  readonly categories = signal<Category[]>([]);

  /** Editable copy of the suggestion — the user confirms *this*, not the raw answer. */
  form = {
    kind: 'none' as 'none' | 'finance' | 'meal' | 'event' | 'job',
    finKind: 'expense' as 'income' | 'expense',
    amount: 0,
    description: '',
    categoryId: null as number | null,
    name: '',
    mealType: 'lunch' as MealType,
    calories: null as number | null,
    protein: null as number | null,
    title: '',
    start: '09:00',
    end: '10:00',
    location: '',
    company: '',
    position: '',
    status: 'applied' as JobStatus,
    date: '',
  };

  readonly proposedCategory = computed(() => {
    const finance = this.suggestion()?.finance;
    return finance && finance.category_id === null ? finance.category : null;
  });

  readonly savedRoute = computed(() => {
    const module = this.suggestion()?.module;
    return module && module !== 'unknown'
      ? { finance: '/finance', meals: '/meals', calendar: '/calendar', jobs: '/jobs' }[module]
      : null;
  });

  canParse(): boolean {
    return !this.parsing() && this.text().trim().length > 0;
  }

  openCapture(): void {
    this.reset();
    this.open.set(true);
  }

  close(): void {
    this.speech.stop();
    this.open.set(false);
  }

  reset(): void {
    this.speech.reset();
    this.phase.set('input');
    this.text.set('');
    this.error.set(null);
    this.suggestion.set(null);
    this.form.kind = 'none';
  }

  backToInput(): void {
    this.error.set(null);
    this.phase.set('input');
  }

  toggleDictation(): void {
    if (this.speech.listening()) {
      this.speech.stop();
      // Dictated text lands in the same field the user can edit by hand.
      const dictated = this.speech.transcript().trim();
      if (dictated) this.text.set(dictated);
      return;
    }
    this.speech.setTranscript(this.text().trim());
    this.speech.start();
  }

  parse(): void {
    if (!this.canParse()) return;
    this.speech.stop();
    this.parsing.set(true);
    this.error.set(null);

    this.api.parse(this.text().trim()).subscribe({
      next: (suggestion) => {
        this.parsing.set(false);
        this.suggestion.set(suggestion);
        this.applyToForm(suggestion);
        this.phase.set('review');
        if (suggestion.module === 'finance') this.loadCategories();
      },
      error: (err) => {
        this.parsing.set(false);
        this.error.set(extractError(err, this.translate.instant('capture.errors.parse')));
      },
    });
  }

  save(): void {
    const request = this.saveRequest();
    if (!request) return;

    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.phase.set('saved');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('capture.errors.save')));
      },
    });
  }

  private applyToForm(suggestion: CaptureSuggestion): void {
    const today = new Date().toISOString().slice(0, 10);
    if (suggestion.finance) {
      const finance = suggestion.finance;
      this.form = {
        ...this.form,
        kind: 'finance',
        finKind: finance.kind,
        amount: finance.amount,
        description: finance.description,
        categoryId: finance.category_id ?? (finance.category ? NEW_CATEGORY : null),
        date: finance.date,
      };
    } else if (suggestion.meal) {
      const meal = suggestion.meal;
      this.form = {
        ...this.form,
        kind: 'meal',
        name: meal.name,
        mealType: meal.meal_type,
        calories: meal.calories,
        protein: meal.protein_g,
        date: meal.date,
      };
    } else if (suggestion.event) {
      const event = suggestion.event;
      this.form = {
        ...this.form,
        kind: 'event',
        title: event.title,
        date: event.date,
        start: event.start_time.slice(0, 5),
        end: event.end_time.slice(0, 5),
        location: event.location ?? '',
      };
    } else if (suggestion.job) {
      const job = suggestion.job;
      this.form = {
        ...this.form,
        kind: 'job',
        company: job.company,
        position: job.position,
        status: job.status,
        date: job.applied_date,
      };
    } else {
      this.form = { ...this.form, kind: 'none', date: today };
    }
  }

  private loadCategories(): void {
    this.finance.listCategories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: () => this.categories.set([]),
    });
  }

  /** Saving goes through the normal module endpoints — quick capture adds no
   * write path of its own, so every validation rule still applies. */
  private saveRequest(): Observable<unknown> | null {
    const form = this.form;
    switch (form.kind) {
      case 'finance': {
        const payload = {
          kind: form.finKind,
          amount: Number(form.amount),
          description: form.description || null,
          date: form.date,
          category_id: form.categoryId === NEW_CATEGORY ? null : form.categoryId,
        };
        const proposed = this.proposedCategory();
        if (form.categoryId === NEW_CATEGORY && proposed) {
          return this.finance
            .createCategory(proposed, form.finKind, CATEGORY_COLORS[0])
            .pipe(
              switchMap((category) =>
                this.finance.createTransaction({ ...payload, category_id: category.id }),
              ),
            );
        }
        return this.finance.createTransaction(payload);
      }
      case 'meal':
        return this.meals.create({
          date: form.date,
          meal_type: form.mealType,
          name: form.name,
          calories: Number(form.calories ?? 0),
          protein_g: form.protein ?? null,
          carbs_g: null,
          fat_g: null,
        });
      case 'event':
        return this.calendar.createEvent({
          title: form.title,
          description: null,
          location: form.location || null,
          color: '#6366f1',
          start_date: form.date,
          end_date: null,
          start_time: form.start,
          end_time: form.end,
          recurrence_days: null,
        });
      case 'job':
        return this.jobs.create({
          company: form.company,
          position: form.position,
          link: null,
          applied_date: form.date,
          notes: null,
          description: null,
          status: form.status,
        });
      default:
        return null;
    }
  }
}
