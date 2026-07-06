import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FxModal } from '../../shared/animations';
import { CalendarApiService } from '../../core/api/calendar-api.service';
import { todayIso } from '../../core/date-utils';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { CalendarEvent, EventPayload } from '../../core/models';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];

@Component({
  selector: 'app-event-form-modal',
  imports: [FormsModule, TranslatePipe, FxModal],
  template: `
    <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="closed.emit()">
      <div
        class="w-full max-w-lg rounded-card border border-edge-strong bg-card p-6 shadow-modal max-h-[90vh] overflow-y-auto"
        fxModal (click)="$event.stopPropagation()"
      >
        <h2 class="text-xl font-semibold mb-4">
          {{ (event() ? 'calendar.form.editTitle' : 'calendar.form.newTitle') | translate }}
        </h2>

        @if (error()) {
          <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
            {{ error() }}
          </p>
        }

        <form class="space-y-4" (ngSubmit)="submit()">
          <div>
            <label for="title" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.title' | translate }}</label>
            <input
              id="title"
              name="title"
              required
              [(ngModel)]="title"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-hover"
              [placeholder]="'calendar.form.titlePlaceholder' | translate"
            />
          </div>

          <div>
            <label for="location" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.location' | translate }}</label>
            <input
              id="location"
              name="location"
              [(ngModel)]="location"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-hover"
              [placeholder]="'common.optional' | translate"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="startTime" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.startTime' | translate }}</label>
              <input
                id="startTime"
                name="startTime"
                type="time"
                required
                [(ngModel)]="startTime"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
              />
            </div>
            <div>
              <label for="endTime" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.endTime' | translate }}</label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                required
                [(ngModel)]="endTime"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
              />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input id="recurring" name="recurring" type="checkbox" [(ngModel)]="recurring" class="accent-accent-hover" />
            <label for="recurring" class="text-sm text-ink-soft">{{ 'calendar.form.repeatsWeekly' | translate }}</label>
          </div>

          @if (recurring) {
            <div>
              <p class="text-sm text-ink-soft mb-2">{{ 'calendar.form.onDays' | translate }}</p>
              <div class="flex gap-1.5 flex-wrap">
                @for (day of weekdayNames(); track $index) {
                  <button
                    type="button"
                    (click)="toggleDay($index)"
                    [class]="
                      'rounded-control px-3 py-1.5 text-sm border transition-colors ' +
                      (days().includes($index)
                        ? 'bg-accent border-accent text-white'
                        : 'bg-field border-edge-strong text-ink-muted hover:border-edge-hover')
                    "
                  >
                    {{ day }}
                  </button>
                }
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="startDate" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.from' | translate }}</label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  [(ngModel)]="startDate"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
                />
              </div>
              <div>
                <label for="endDate" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.until' | translate }}</label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  [(ngModel)]="endDate"
                  class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
                />
              </div>
            </div>
          } @else {
            <div>
              <label for="date" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.date' | translate }}</label>
              <input
                id="date"
                name="date"
                type="date"
                required
                [(ngModel)]="startDate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
              />
            </div>
          }

          <div>
            <p class="text-sm text-ink-soft mb-2">{{ 'calendar.form.color' | translate }}</p>
            <div class="flex gap-2">
              @for (c of colors; track c) {
                <button
                  type="button"
                  (click)="color.set(c)"
                  class="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  [style.background]="c"
                  [style.border-color]="color() === c ? swatchRing() : 'transparent'"
                ></button>
              }
            </div>
          </div>

          <div>
            <label for="description" class="block text-sm text-ink-soft mb-1">{{ 'calendar.form.notes' | translate }}</label>
            <textarea
              id="description"
              name="description"
              rows="2"
              [(ngModel)]="description"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"
              [placeholder]="'common.optional' | translate"
            ></textarea>
          </div>

          <div class="flex items-center justify-between pt-2">
            @if (event()) {
              <button
                type="button"
                (click)="remove()"
                class="rounded-control border border-danger-edge text-danger px-4 py-2 text-sm hover:bg-danger-surface transition-colors"
              >
                {{ 'common.delete' | translate }}
              </button>
            } @else {
              <span></span>
            }
            <div class="flex gap-2">
              <button
                type="button"
                (click)="closed.emit()"
                class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field transition-colors"
              >
                {{ 'common.cancel' | translate }}
              </button>
              <button
                type="submit"
                [disabled]="saving()"
                class="rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
              >
                {{ (saving() ? 'common.saving' : 'common.save') | translate }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class EventFormModal {
  private readonly api = inject(CalendarApiService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly themeService = inject(ThemeService);

  /** Ring color for the selected color swatch — must contrast with the card surface. */
  readonly swatchRing = computed(() =>
    this.themeService.effective() === 'dark' ? 'white' : '#0f172a',
  );

  /** Event to edit; null = create mode. */
  readonly event = input<CalendarEvent | null>(null);
  /** Prefill date for create mode (YYYY-MM-DD). */
  readonly initialDate = input<string | null>(null);

  readonly closed = output<void>();
  readonly saved = output<void>();

  /** Mon–Sun short names in the active locale (2024-01-01 is a Monday). */
  readonly weekdayNames = computed(() => {
    const locale = this.language.locale();
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
    );
  });
  readonly colors = COLORS;

  title = '';
  location = '';
  description = '';
  startTime = '09:00';
  endTime = '10:00';
  startDate = '';
  endDate = '';
  recurring = false;
  readonly days = signal<number[]>([]);
  readonly color = signal(COLORS[0]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly isEdit = computed(() => this.event() !== null);

  ngOnInit(): void {
    const ev = this.event();
    if (ev) {
      this.title = ev.title;
      this.location = ev.location ?? '';
      this.description = ev.description ?? '';
      this.startTime = ev.start_time.slice(0, 5);
      this.endTime = ev.end_time.slice(0, 5);
      this.startDate = ev.start_date;
      this.endDate = ev.end_date ?? '';
      this.recurring = ev.recurrence_days !== null;
      this.days.set(ev.recurrence_days ?? []);
      this.color.set(ev.color);
    } else {
      this.startDate = this.initialDate() ?? todayIso();
    }
  }

  toggleDay(day: number): void {
    this.days.update((d) =>
      d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort((a, b) => a - b),
    );
  }

  submit(): void {
    if (!this.title.trim()) return;
    if (this.recurring && this.days().length === 0) {
      this.error.set(this.translate.instant('calendar.form.errors.days'));
      return;
    }
    if (this.endTime <= this.startTime) {
      this.error.set(this.translate.instant('calendar.form.errors.endTime'));
      return;
    }
    const payload: EventPayload = {
      title: this.title.trim(),
      description: this.description.trim() || null,
      location: this.location.trim() || null,
      color: this.color(),
      start_date: this.startDate,
      end_date: this.recurring && this.endDate ? this.endDate : null,
      start_time: this.startTime,
      end_time: this.endTime,
      recurrence_days: this.recurring ? this.days() : null,
    };
    this.saving.set(true);
    this.error.set(null);
    const ev = this.event();
    const req = ev ? this.api.updateEvent(ev.id, payload) : this.api.createEvent(payload);
    req.subscribe({
      next: () => this.saved.emit(),
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('common.genericError')));
      },
    });
  }

  remove(): void {
    const ev = this.event();
    if (!ev || !confirm(this.translate.instant('calendar.form.deleteConfirm', { title: ev.title }))) return;
    this.api.deleteEvent(ev.id).subscribe({
      next: () => this.saved.emit(),
      error: (err) =>
        this.error.set(extractError(err, this.translate.instant('calendar.form.errors.delete'))),
    });
  }
}
