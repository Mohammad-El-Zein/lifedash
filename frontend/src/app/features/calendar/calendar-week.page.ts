import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FxModal } from '../../shared/animations';
import { CalendarApiService } from '../../core/api/calendar-api.service';
import { toIsoDate } from '../../core/date-utils';
import { LanguageService } from '../../core/i18n/language.service';
import { CalendarEvent, Occurrence } from '../../core/models';
import { EventFormModal } from './event-form.modal';

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;

interface DayColumn {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  isToday: boolean;
  occurrences: PositionedOccurrence[];
}

interface PositionedOccurrence {
  occ: Occurrence;
  topPct: number;
  heightPct: number;
}

@Component({
  selector: 'app-calendar-week-page',
  imports: [FormsModule, EventFormModal, TranslatePipe, FxModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'calendar.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">{{ weekLabel() }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button (click)="shiftWeek(-1)" class="rounded-control border border-edge-strong px-3 py-2 hover:bg-field transition-colors" [attr.aria-label]="'calendar.prevWeek' | translate">←</button>
        <button (click)="goToday()" class="rounded-control border border-edge-strong px-4 py-2 text-sm hover:bg-field transition-colors">{{ 'common.today' | translate }}</button>
        <button (click)="shiftWeek(1)" class="rounded-control border border-edge-strong px-3 py-2 hover:bg-field transition-colors" [attr.aria-label]="'calendar.nextWeek' | translate">→</button>
        <button
          (click)="openCreate(null)"
          class="ml-2 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors"
        >
          {{ 'calendar.newEvent' | translate }}
        </button>
      </div>
    </header>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'calendar.loadingWeek' | translate }}</p>
    } @else {
      <div class="rounded-card border border-edge bg-card overflow-hidden">
        <!-- Day headers -->
        <div class="grid" style="grid-template-columns: 3.5rem repeat(7, 1fr)">
          <div class="border-b border-edge"></div>
          @for (day of days(); track day.date) {
            <button
              (click)="openCreate(day.date)"
              class="border-b border-l border-edge px-2 py-3 text-center hover:bg-field-soft transition-colors"
              [title]="'calendar.addEventOn' | translate: { date: day.date }"
            >
              <span class="text-xs text-ink-muted uppercase">{{ dayLabel(day.date) }}</span>
              <span
                class="ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm"
                [class]="day.isToday ? 'bg-accent text-white font-semibold' : 'text-ink'"
              >
                {{ day.dayOfMonth }}
              </span>
            </button>
          }
        </div>

        <!-- Time grid -->
        <div class="grid relative" style="grid-template-columns: 3.5rem repeat(7, 1fr); height: 60vh; min-height: 480px">
          <!-- Hour labels -->
          <div class="relative">
            @for (hour of hours; track hour) {
              <span
                class="absolute right-1.5 -translate-y-1/2 text-[10px] text-ink-faint"
                [style.top.%]="hourTopPct(hour)"
              >
                {{ hour }}:00
              </span>
            }
          </div>

          @for (day of days(); track day.date) {
            <div class="relative border-l border-edge" [class]="day.isToday ? 'bg-today' : ''">
              @for (hour of hours; track hour) {
                <div class="absolute inset-x-0 border-t border-edge-soft" [style.top.%]="hourTopPct(hour)"></div>
              }
              @for (
                item of day.occurrences;
                track item.occ.event_id + '-' + (item.occ.exception_id ?? 'r') + '-' + item.occ.date + '-' + item.occ.start_time
              ) {
                <button
                  class="absolute inset-x-0.5 rounded-control px-1.5 py-0.5 text-left text-xs overflow-hidden border border-white/10 hover:brightness-110 transition-all"
                  [style.top.%]="item.topPct"
                  [style.height.%]="item.heightPct"
                  [style.background]="item.occ.color + 'cc'"
                  (click)="select(item.occ)"
                >
                  <span class="font-semibold block truncate">
                    {{ item.occ.title }}
                    @if (item.occ.is_moved) { <span [title]="'calendar.moved' | translate">↪</span> }
                  </span>
                  <span class="block truncate text-white/80">
                    {{ item.occ.start_time.slice(0, 5) }}–{{ item.occ.end_time.slice(0, 5) }}
                  </span>
                </button>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- Occurrence detail / actions panel -->
    @if (selected(); as occ) {
      <div class="fx-fade fixed inset-0 z-40 flex items-center justify-center bg-backdrop p-4" (click)="selected.set(null)">
        <div
          class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal"
          fxModal (click)="$event.stopPropagation()"
        >
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-lg font-semibold">{{ occ.title }}</h2>
              <p class="text-sm text-ink-muted mt-0.5">
                {{ occ.date }} · {{ occ.start_time.slice(0, 5) }}–{{ occ.end_time.slice(0, 5) }}
                @if (occ.location) { · {{ occ.location }} }
              </p>
              @if (occ.is_moved) {
                <p class="text-xs text-warn mt-1">{{ 'calendar.movedNote' | translate }}</p>
              }
            </div>
            <span class="h-4 w-4 rounded-full mt-1" [style.background]="occ.color"></span>
          </div>

          @if (occ.description) {
            <p class="text-sm text-ink-soft mt-3">{{ occ.description }}</p>
          }

          @if (moveMode()) {
            <div class="mt-4 space-y-3 rounded-card border border-edge-strong bg-field-soft p-4">
              <p class="text-sm font-medium">{{ 'calendar.moveTo' | translate }}</p>
              <input type="date" [(ngModel)]="moveDate" class="w-full rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
              <div class="grid grid-cols-2 gap-2">
                <input type="time" [(ngModel)]="moveStart" class="rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
                <input type="time" [(ngModel)]="moveEnd" class="rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
              </div>
              @if (actionError()) {
                <p class="text-xs text-danger">{{ actionError() }}</p>
              }
              <div class="flex justify-end gap-2">
                <button (click)="moveMode.set(false)" class="rounded-control border border-edge-strong px-3 py-1.5 text-sm hover:bg-field">{{ 'common.back' | translate }}</button>
                <button (click)="confirmMove(occ)" class="rounded-control bg-accent hover:bg-accent-hover px-3 py-1.5 text-sm font-medium">{{ 'calendar.move' | translate }}</button>
              </div>
            </div>
          } @else {
            <div class="mt-5 grid gap-2">
              <button (click)="editSeries(occ)" class="rounded-control border border-edge-strong px-4 py-2 text-sm text-left hover:bg-field transition-colors">
                ✏️ {{ (occ.is_recurring ? 'calendar.editSeries' : 'calendar.editEvent') | translate }}
              </button>
              @if (occ.is_recurring || occ.is_moved) {
                @if (occ.is_moved && occ.exception_id) {
                  <button (click)="revertMove(occ)" class="rounded-control border border-edge-strong px-4 py-2 text-sm text-left hover:bg-field transition-colors">
                    ↩️ {{ 'calendar.revert' | translate }}
                  </button>
                } @else {
                  <button (click)="startMove(occ)" class="rounded-control border border-edge-strong px-4 py-2 text-sm text-left hover:bg-field transition-colors">
                    📆 {{ 'calendar.moveOnly' | translate }}
                  </button>
                  <button (click)="cancelOccurrence(occ)" class="rounded-control border border-warn-edge text-warn px-4 py-2 text-sm text-left hover:bg-warn-surface transition-colors">
                    🚫 {{ 'calendar.cancelOnly' | translate }}
                  </button>
                }
              }
              @if (actionError()) {
                <p class="text-xs text-danger">{{ actionError() }}</p>
              }
            </div>
          }
        </div>
      </div>
    }

    @if (showForm()) {
      <app-event-form-modal
        [event]="editingEvent()"
        [initialDate]="createDate()"
        (closed)="closeForm()"
        (saved)="onSaved()"
      />
    }
  `,
})
export class CalendarWeekPage {
  private readonly api = inject(CalendarApiService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, i) => DAY_START_HOUR + i,
  );

  readonly weekStart = signal(mondayOf(new Date()));
  readonly loading = signal(true);
  readonly days = signal<DayColumn[]>([]);
  readonly selected = signal<Occurrence | null>(null);
  readonly moveMode = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly showForm = signal(false);
  readonly editingEvent = signal<CalendarEvent | null>(null);
  readonly createDate = signal<string | null>(null);

  moveDate = '';
  moveStart = '';
  moveEnd = '';

  readonly weekLabel = computed(() => {
    const locale = this.language.locale();
    const start = this.weekStart();
    const end = addDays(start, 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  });

  ngOnInit(): void {
    this.load();
  }

  dayLabel(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(this.language.locale(), { weekday: 'short' });
  }

  load(): void {
    this.loading.set(true);
    this.api.getWeek(toIso(this.weekStart())).subscribe({
      next: (res) => {
        const today = toIso(new Date());
        const byDate = new Map<string, Occurrence[]>();
        for (const occ of res.occurrences) {
          const list = byDate.get(occ.date) ?? [];
          list.push(occ);
          byDate.set(occ.date, list);
        }
        const days: DayColumn[] = [];
        for (let i = 0; i < 7; i++) {
          const d = addDays(this.weekStart(), i);
          const iso = toIso(d);
          days.push({
            date: iso,
            dayOfMonth: d.getDate(),
            isToday: iso === today,
            occurrences: (byDate.get(iso) ?? []).map(position),
          });
        }
        this.days.set(days);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  hourTopPct(hour: number): number {
    return ((hour - DAY_START_HOUR) * 60 * 100) / DAY_MINUTES;
  }

  shiftWeek(direction: number): void {
    this.weekStart.set(addDays(this.weekStart(), direction * 7));
    this.load();
  }

  goToday(): void {
    this.weekStart.set(mondayOf(new Date()));
    this.load();
  }

  select(occ: Occurrence): void {
    this.actionError.set(null);
    this.moveMode.set(false);
    this.selected.set(occ);
  }

  openCreate(date: string | null): void {
    this.editingEvent.set(null);
    this.createDate.set(date);
    this.showForm.set(true);
  }

  editSeries(occ: Occurrence): void {
    this.api.getEvent(occ.event_id).subscribe({
      next: (event) => {
        this.selected.set(null);
        this.editingEvent.set(event);
        this.showForm.set(true);
      },
      error: () => this.actionError.set(this.translate.instant('calendar.errors.loadEvent')),
    });
  }

  startMove(occ: Occurrence): void {
    this.moveDate = occ.date;
    this.moveStart = occ.start_time.slice(0, 5);
    this.moveEnd = occ.end_time.slice(0, 5);
    this.actionError.set(null);
    this.moveMode.set(true);
  }

  confirmMove(occ: Occurrence): void {
    if (!this.moveDate || !this.moveStart || !this.moveEnd || this.moveEnd <= this.moveStart) {
      this.actionError.set(this.translate.instant('calendar.errors.moveInvalid'));
      return;
    }
    this.api
      .createException(occ.event_id, {
        original_date: occ.date,
        kind: 'moved',
        new_date: this.moveDate,
        new_start_time: this.moveStart,
        new_end_time: this.moveEnd,
        note: null,
      })
      .subscribe({
        next: () => this.afterAction(),
        error: () => this.actionError.set(this.translate.instant('calendar.errors.move')),
      });
  }

  cancelOccurrence(occ: Occurrence): void {
    this.api
      .createException(occ.event_id, {
        original_date: occ.date,
        kind: 'cancelled',
        new_date: null,
        new_start_time: null,
        new_end_time: null,
        note: null,
      })
      .subscribe({
        next: () => this.afterAction(),
        error: () => this.actionError.set(this.translate.instant('calendar.errors.cancel')),
      });
  }

  revertMove(occ: Occurrence): void {
    if (occ.exception_id === null) return;
    this.api.deleteException(occ.exception_id).subscribe({
      next: () => this.afterAction(),
      error: () => this.actionError.set(this.translate.instant('calendar.errors.revert')),
    });
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingEvent.set(null);
    this.createDate.set(null);
  }

  onSaved(): void {
    this.closeForm();
    this.load();
  }

  private afterAction(): void {
    this.selected.set(null);
    this.moveMode.set(false);
    this.load();
  }
}

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - weekday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const toIso = toIsoDate;

function position(occ: Occurrence): PositionedOccurrence {
  const startMin = clamp(minutes(occ.start_time) - DAY_START_HOUR * 60, 0, DAY_MINUTES);
  const endMin = clamp(minutes(occ.end_time) - DAY_START_HOUR * 60, 0, DAY_MINUTES);
  const topPct = (startMin * 100) / DAY_MINUTES;
  const heightPct = Math.max(((endMin - startMin) * 100) / DAY_MINUTES, 2.5);
  return { occ, topPct, heightPct };
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
