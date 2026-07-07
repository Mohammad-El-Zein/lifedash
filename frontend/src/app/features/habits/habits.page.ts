import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HabitsApiService } from '../../core/api/habits-api.service';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import { Habit } from '../../core/models';
import { FxModal, staggerTilesSoon } from '../../shared/animations';

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mondayOf(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

@Component({
  selector: 'app-habits-page',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, FxModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'habits.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">{{ weekLabel() }}</p>
      </div>
      <button (click)="openForm(null)"
        class="inline-flex items-center gap-1.5 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
        <lucide-icon name="plus" [size]="16" /> {{ 'habits.addHabit' | translate }}
      </button>
    </header>

    <!-- Week navigation -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <button (click)="shiftWeek(-1)" [title]="'habits.prevWeek' | translate"
        class="rounded-control border border-edge-strong p-2 text-ink-soft hover:bg-field transition-colors">
        <lucide-icon name="chevron-left" [size]="16" />
      </button>
      <button (click)="shiftWeek(1)" [title]="'habits.nextWeek' | translate"
        class="rounded-control border border-edge-strong p-2 text-ink-soft hover:bg-field transition-colors">
        <lucide-icon name="chevron-right" [size]="16" />
      </button>
      @if (!isCurrentWeek()) {
        <button (click)="goToday()"
          class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field transition-colors">
          {{ 'common.today' | translate }}
        </button>
      }
      <label class="ml-auto inline-flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
        <input type="checkbox" name="showArchived" [ngModel]="showArchived()"
          (ngModelChange)="toggleArchivedVisible($event)" class="accent-current" />
        {{ 'habits.showArchived' | translate }}
      </label>
    </div>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (habits().length === 0) {
      <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
        {{ 'habits.noHabits' | translate }}
      </div>
    } @else {
      <div class="rounded-card border border-edge bg-card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-ink-muted border-b border-edge">
                <th class="px-5 py-3 font-medium text-left">{{ 'habits.habit' | translate }}</th>
                @for (day of weekDays(); track day.iso) {
                  <th class="px-2 py-3 font-medium text-center w-16"
                    [class.text-ink]="day.iso === today">
                    <span class="block text-xs uppercase tracking-wide">{{ day.weekday }}</span>
                    <span class="block tabular-nums" [class.font-semibold]="day.iso === today">{{ day.dayNum }}</span>
                  </th>
                }
                <th class="px-4 py-3 font-medium text-right">{{ 'habits.streak' | translate }}</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              @for (habit of habits(); track habit.id) {
                <tr class="border-b border-edge last:border-0" [class.opacity-60]="habit.is_archived">
                  <td class="px-5 py-2.5 font-medium">
                    {{ habit.name }}
                    @if (habit.schedule_days !== null) {
                      <span class="block text-xs text-ink-faint font-normal">{{ scheduleLabel(habit) }}</span>
                    }
                    @if (habit.is_archived) {
                      <span class="block text-xs text-ink-faint font-normal">{{ 'habits.archived' | translate }}</span>
                    }
                  </td>
                  @for (day of weekDays(); track day.iso) {
                    <td class="px-2 py-2.5 text-center">
                      @if (isScheduled(habit, day.weekdayNum)) {
                        <button (click)="toggle(habit, day.iso)" [disabled]="day.iso > today || habit.is_archived"
                          [class]="'h-7 w-7 rounded-full border inline-flex items-center justify-center transition-colors ' +
                            (habit.week_logs[day.iso]
                              ? 'bg-accent border-accent'
                              : 'border-edge-strong hover:border-accent disabled:hover:border-edge-strong') +
                            ' disabled:opacity-40 disabled:cursor-not-allowed'"
                          [title]="day.iso + (habit.week_logs[day.iso] ? ' ✓' : '')">
                          @if (habit.week_logs[day.iso]) { <lucide-icon name="check" [size]="14" /> }
                        </button>
                      } @else {
                        <span class="text-ink-faint">·</span>
                      }
                    </td>
                  }
                  <td class="px-4 py-2.5 text-right whitespace-nowrap">
                    <span class="inline-flex items-center gap-1 tabular-nums"
                      [class.text-ink-faint]="habit.streak === 0">
                      <lucide-icon name="flame" [size]="14"
                        [class]="habit.streak > 0 ? 'text-warn' : ''" />
                      {{ habit.streak }}
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-right whitespace-nowrap">
                    <button (click)="openForm(habit)" [title]="'common.edit' | translate"
                      class="text-ink-faint hover:text-ink px-1"><lucide-icon name="pencil" [size]="15" /></button>
                    <button (click)="remove(habit)" [title]="'common.delete' | translate"
                      class="text-ink-faint hover:text-danger px-1"><lucide-icon name="trash-2" [size]="15" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <!-- Add/edit modal -->
    @if (showForm()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showForm.set(false)">
        <div class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">
            {{ (editing() ? 'habits.form.editTitle' : 'habits.form.newTitle') | translate }}
          </h2>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submit()">
            <div>
              <label for="habitName" class="block text-sm text-ink-soft mb-1">{{ 'habits.form.name' | translate }}</label>
              <input id="habitName" name="habitName" required [(ngModel)]="fName"
                [placeholder]="'habits.form.namePlaceholder' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <span class="block text-sm text-ink-soft mb-1">{{ 'habits.form.schedule' | translate }}</span>
              <div class="flex gap-1.5">
                @for (day of weekdayChips; track day.num) {
                  <button type="button" (click)="toggleDay(day.num)"
                    [class]="'h-9 w-9 rounded-control border text-xs font-medium transition-colors ' +
                      (fDays.includes(day.num) ? 'border-accent bg-nav-active' : 'border-edge-strong text-ink-muted hover:bg-field-soft')">
                    {{ day.label }}
                  </button>
                }
              </div>
              <p class="text-xs text-ink-faint mt-1">{{ 'habits.form.scheduleHint' | translate }}</p>
            </div>
            @if (editing()) {
              <label class="inline-flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
                <input type="checkbox" name="habitArchived" [(ngModel)]="fArchived" class="accent-current" />
                {{ 'habits.form.archived' | translate }}
              </label>
            }
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showForm.set(false)"
                class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field">
                {{ 'common.cancel' | translate }}
              </button>
              <button type="submit" [disabled]="saving() || fDays.length === 0"
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
export class HabitsPage {
  private readonly api = inject(HabitsApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly today = toIsoDate(new Date());
  private readonly currentMonday = toIsoDate(mondayOf(new Date()));

  readonly weekStart = signal(this.currentMonday);
  readonly loading = signal(true);
  readonly habits = signal<Habit[]>([]);
  readonly showArchived = signal(false);

  readonly showForm = signal(false);
  readonly editing = signal<Habit | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  fName = '';
  fDays: number[] = [];
  fArchived = false;

  readonly weekdayChips = Array.from({ length: 7 }, (_, num) => ({
    num,
    label: this.weekdayShort(num),
  }));

  readonly weekDays = computed(() => {
    const start = new Date(`${this.weekStart()}T00:00:00`);
    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      return {
        iso: toIsoDate(date),
        dayNum: date.getDate(),
        weekday: date.toLocaleDateString(this.language.locale(), { weekday: 'short' }),
        weekdayNum: offset,
      };
    });
  });

  readonly isCurrentWeek = computed(() => this.weekStart() === this.currentMonday);

  readonly weekLabel = computed(() => {
    const days = this.weekDays();
    const fmt = (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString(this.language.locale(), {
        day: 'numeric',
        month: 'short',
      });
    return `${fmt(days[0].iso)} – ${fmt(days[6].iso)}`;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.list(this.weekStart(), this.showArchived()).subscribe({
      next: (habits) => {
        this.habits.set(habits);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: () => this.loading.set(false),
    });
  }

  private weekdayShort(num: number): string {
    // 2026-07-06 is a Monday; offset from it to get localized weekday names
    const base = new Date(2026, 6, 6 + num);
    return base.toLocaleDateString(this.language.locale(), { weekday: 'short' });
  }

  isScheduled(habit: Habit, weekdayNum: number): boolean {
    return habit.schedule_days === null || habit.schedule_days.includes(weekdayNum);
  }

  scheduleLabel(habit: Habit): string {
    return (habit.schedule_days ?? []).map((d) => this.weekdayShort(d)).join(', ');
  }

  shiftWeek(delta: number): void {
    const start = new Date(`${this.weekStart()}T00:00:00`);
    start.setDate(start.getDate() + delta * 7);
    this.weekStart.set(toIsoDate(start));
    this.load();
  }

  goToday(): void {
    this.weekStart.set(this.currentMonday);
    this.load();
  }

  toggleArchivedVisible(show: boolean): void {
    this.showArchived.set(show);
    this.load();
  }

  toggle(habit: Habit, iso: string): void {
    this.api.toggle(habit.id, iso).subscribe({ next: () => this.load() });
  }

  toggleDay(num: number): void {
    this.fDays = this.fDays.includes(num)
      ? this.fDays.filter((d) => d !== num)
      : [...this.fDays, num].sort();
  }

  openForm(habit: Habit | null): void {
    this.editing.set(habit);
    this.error.set(null);
    this.fName = habit?.name ?? '';
    this.fDays = habit?.schedule_days ?? [0, 1, 2, 3, 4, 5, 6];
    this.fArchived = habit?.is_archived ?? false;
    this.showForm.set(true);
  }

  submit(): void {
    if (!this.fName.trim() || this.fDays.length === 0) {
      this.error.set(this.translate.instant('habits.errors.required'));
      return;
    }
    const payload = {
      name: this.fName.trim(),
      schedule_days: this.fDays.length === 7 ? null : this.fDays,
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.editing();
    const req = editing
      ? this.api.update(editing.id, { ...payload, is_archived: this.fArchived })
      : this.api.create(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('habits.errors.save')));
      },
    });
  }

  remove(habit: Habit): void {
    if (!confirm(this.translate.instant('habits.deleteConfirm', { name: habit.name }))) return;
    this.api.delete(habit.id).subscribe({ next: () => this.load() });
  }
}
