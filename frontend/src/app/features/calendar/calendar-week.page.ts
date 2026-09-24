import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FxModal } from '../../shared/animations';
import { CalendarApiService } from '../../core/api/calendar-api.service';
import { toIsoDate } from '../../core/date-utils';
import { LanguageService } from '../../core/i18n/language.service';
import { ViewportService } from '../../core/layout/viewport.service';
import { CalendarEvent, Occurrence } from '../../core/models';
import { EventFormModal } from './event-form.modal';
import { deepLink } from '../../shared/deep-link';

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;

/** How far a touch has to travel sideways before it counts as a day swipe. */
const SWIPE_THRESHOLD_PX = 50;

/**
 * Two lines of text need roughly 30px, which an event shorter than an hour
 * does not get in either grid — those blocks show the title alone.
 */
const TIME_LABEL_MIN_PCT = (60 * 100) / DAY_MINUTES;

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
  imports: [FormsModule, EventFormModal, NgTemplateOutlet, TranslatePipe, FxModal, LucideAngularModule],
  template: `
    <header class="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold">{{ 'calendar.title' | translate }}</h1>
        <p class="text-ink-muted mt-1 text-sm sm:text-base">{{ periodLabel() }}</p>
      </div>
      <div class="flex flex-1 items-center gap-2 sm:flex-none">
        <button (click)="shiftPeriod(-1)" class="flex h-11 w-11 items-center justify-center rounded-control border border-edge-strong hover:bg-field transition-colors" [attr.aria-label]="(dayView() ? 'calendar.prevDay' : 'calendar.prevWeek') | translate"><lucide-icon name="chevron-left" [size]="16" /></button>
        <button (click)="goToday()" class="min-h-11 rounded-control border border-edge-strong px-4 text-sm hover:bg-field transition-colors">{{ 'common.today' | translate }}</button>
        <button (click)="shiftPeriod(1)" class="flex h-11 w-11 items-center justify-center rounded-control border border-edge-strong hover:bg-field transition-colors" [attr.aria-label]="(dayView() ? 'calendar.nextDay' : 'calendar.nextWeek') | translate"><lucide-icon name="chevron-right" [size]="16" /></button>
        <button
          (click)="openCreate(null)"
          class="ml-auto min-h-11 shrink-0 rounded-control bg-accent hover:bg-accent-hover px-4 text-sm font-medium transition-colors sm:ml-2"
        >
          {{ 'calendar.newEvent' | translate }}
        </button>
      </div>
    </header>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'calendar.loadingWeek' | translate }}</p>
    } @else if (dayView()) {
      <!-- Handset: one day at a time, swipe or use the week strip to move. -->
      <div class="rounded-card border border-edge bg-card overflow-hidden">
        <div class="grid grid-cols-7 border-b border-edge">
          @for (day of days(); track day.date) {
            <button
              (click)="dayIndex.set($index)"
              class="flex min-h-14 flex-col items-center justify-center gap-0.5 transition-colors"
              [class]="$index === dayIndex() ? 'bg-nav-active' : 'hover:bg-field-soft'"
              [attr.aria-label]="'calendar.pickDay' | translate"
              [attr.aria-current]="$index === dayIndex() ? 'date' : null"
            >
              <span class="text-[10px] uppercase text-ink-muted">{{ dayLabel(day.date).slice(0, 2) }}</span>
              <span
                class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm"
                [class]="day.isToday ? 'bg-accent text-white font-semibold' : 'text-ink'"
              >
                {{ day.dayOfMonth }}
              </span>
            </button>
          }
        </div>

        @if (activeDay(); as day) {
          <div
            class="grid relative touch-pan-y"
            style="grid-template-columns: 3rem 1fr; height: 62vh; min-height: 420px"
            (touchstart)="onTouchStart($event)"
            (touchend)="onTouchEnd($event)"
          >
            <ng-container *ngTemplateOutlet="hourLabels" />
            <ng-container *ngTemplateOutlet="dayColumn; context: { $implicit: day }" />
          </div>
        }
      </div>
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
          <ng-container *ngTemplateOutlet="hourLabels" />
          @for (day of days(); track day.date) {
            <ng-container *ngTemplateOutlet="dayColumn; context: { $implicit: day }" />
          }
        </div>
      </div>
    }

    <!-- Shared between the week grid and the handset day view -->
    <ng-template #hourLabels>
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
    </ng-template>

    <ng-template #dayColumn let-day>
      <div class="relative border-l border-edge" [class]="day.isToday ? 'bg-today' : ''">
        @for (hour of hours; track hour) {
          <div class="absolute inset-x-0 border-t border-edge-soft" [style.top.%]="hourTopPct(hour)"></div>
        }
        @for (
          item of day.occurrences;
          track item.occ.event_id + '-' + (item.occ.exception_id ?? 'r') + '-' + item.occ.date + '-' + item.occ.start_time
        ) {
          <button
            class="absolute inset-x-0.5 min-h-6 rounded-control px-1.5 py-0.5 text-left text-xs leading-tight overflow-hidden border border-white/10 hover:brightness-110 transition-all"
            [style.top.%]="item.topPct"
            [style.height.%]="item.heightPct"
            [style.background]="item.occ.color + 'cc'"
            (click)="select(item.occ)"
          >
            <span class="font-semibold block truncate">
              {{ item.occ.title }}
              @if (item.occ.is_moved) { <span [title]="'calendar.moved' | translate"><lucide-icon name="corner-down-right" [size]="12" /></span> }
            </span>
            <!-- A short block only has room for the title; the time would be clipped. -->
            @if (item.heightPct >= TIME_LABEL_MIN_PCT) {
              <span class="block truncate text-white/80">
                {{ item.occ.start_time.slice(0, 5) }}–{{ item.occ.end_time.slice(0, 5) }}
              </span>
            }
          </button>
        }
      </div>
    </ng-template>

    <!-- Occurrence detail / actions panel -->
    @if (selected(); as occ) {
      <div class="fx-fade fixed inset-0 z-40 flex items-end justify-center bg-backdrop p-4 sm:items-center" (click)="selected.set(null)">
        <div
          class="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-card border border-edge-strong bg-card p-5 shadow-modal sm:p-6"
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
                <lucide-icon name="pencil" [size]="15" class="mr-1.5" />{{ (occ.is_recurring ? 'calendar.editSeries' : 'calendar.editEvent') | translate }}
              </button>
              @if (occ.is_recurring || occ.is_moved) {
                @if (occ.is_moved && occ.exception_id) {
                  <button (click)="revertMove(occ)" class="rounded-control border border-edge-strong px-4 py-2 text-sm text-left hover:bg-field transition-colors">
                    <lucide-icon name="undo-2" [size]="15" class="mr-1.5" />{{ 'calendar.revert' | translate }}
                  </button>
                } @else {
                  <button (click)="startMove(occ)" class="rounded-control border border-edge-strong px-4 py-2 text-sm text-left hover:bg-field transition-colors">
                    <lucide-icon name="calendar-clock" [size]="15" class="mr-1.5" />{{ 'calendar.moveOnly' | translate }}
                  </button>
                  <button (click)="cancelOccurrence(occ)" class="rounded-control border border-warn-edge text-warn px-4 py-2 text-sm text-left hover:bg-warn-surface transition-colors">
                    <lucide-icon name="ban" [size]="15" class="mr-1.5" />{{ 'calendar.cancelOnly' | translate }}
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
  /** One-shot params from the command palette (?new=1, ?tab=…, …).
   * A constructor body runs after every field initializer, so the
   * synchronous first emission sees fully built state. */
  constructor() {
    deepLink(['new', 'date'], (params) => {
      const date = params.get('date');
      if (date) {
        const [year, month, day] = date.split('-').map(Number);
        const target = new Date(year, month - 1, day);
        const monday = mondayOf(target);
        this.weekStart.set(monday);
        // The day view has to land on the linked date, not just its week.
        this.dayIndex.set(Math.round((target.getTime() - monday.getTime()) / 86_400_000));
        // On the first (pre-ngOnInit) emission the initial load already picks this up.
        if (this.started) this.load();
      }
      if (params.get('new')) this.openCreate(date);
    });
  }

  private readonly api = inject(CalendarApiService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly viewport = inject(ViewportService);

  /**
   * Seven columns of 30-minute slots do not survive a 375px screen, so a
   * handset shows a single day and moves between days by swipe, the arrows in
   * the header, or the week strip above the grid.
   */
  readonly dayView = this.viewport.isHandset;
  readonly dayIndex = signal(todayIndexIn(mondayOf(new Date())));

  /** Exposed for the template's block-height check. */
  protected readonly TIME_LABEL_MIN_PCT = TIME_LABEL_MIN_PCT;

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

  readonly activeDay = computed(() => this.days()[this.dayIndex()] ?? null);

  /** The header caption: a single date in the day view, the range otherwise. */
  readonly periodLabel = computed(() => {
    if (!this.dayView()) return this.weekLabel();
    const day = this.activeDay();
    if (!day) return this.weekLabel();
    const [y, m, d] = day.date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(this.language.locale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  });

  /** Where the first touch of a potential swipe landed. */
  private touchStart: { x: number; y: number } | null = null;

  /** False until ngOnInit has run its first load. */
  private started = false;

  ngOnInit(): void {
    this.load();
    this.started = true;
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

  /** The arrows step by a day in the day view and by a week otherwise. */
  shiftPeriod(direction: number): void {
    if (this.dayView()) this.shiftDay(direction);
    else this.shiftWeek(direction);
  }

  /** Moves one day, rolling into the neighbouring week at either end. */
  shiftDay(direction: number): void {
    const next = this.dayIndex() + direction;
    if (next < 0) {
      this.dayIndex.set(6);
      this.shiftWeek(-1);
    } else if (next > 6) {
      this.dayIndex.set(0);
      this.shiftWeek(1);
    } else {
      this.dayIndex.set(next);
    }
  }

  goToday(): void {
    const monday = mondayOf(new Date());
    this.dayIndex.set(todayIndexIn(monday));
    this.weekStart.set(monday);
    this.load();
  }

  onTouchStart(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    this.touchStart = { x: touch.clientX, y: touch.clientY };
  }

  /**
   * A mostly-horizontal drag moves to the neighbouring day. Vertical drags are
   * left alone so the grid can still be scrolled.
   */
  onTouchEnd(event: TouchEvent): void {
    const start = this.touchStart;
    this.touchStart = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    this.shiftDay(dx < 0 ? 1 : -1);
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

/** Index of today inside the week starting at `monday`, or 0 if it is elsewhere. */
function todayIndexIn(monday: Date): number {
  const today = new Date();
  const days = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - monday.getTime()) /
      86_400_000,
  );
  return days >= 0 && days <= 6 ? days : 0;
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
