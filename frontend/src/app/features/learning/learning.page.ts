import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LearningApiService } from '../../core/api/learning-api.service';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import { GOAL_STATUSES, GoalStatus, LearningGoal, Milestone } from '../../core/models';
import { FxModal, staggerTilesSoon } from '../../shared/animations';

@Component({
  selector: 'app-learning-page',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, FxModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'learning.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">{{ 'learning.count' | translate: { n: goals().length } }}</p>
      </div>
      <button (click)="openForm(null)"
        class="inline-flex items-center gap-1.5 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
        <lucide-icon name="plus" [size]="16" /> {{ 'learning.addGoal' | translate }}
      </button>
    </header>

    <!-- Status filter chips -->
    <div class="mb-6 flex flex-wrap gap-2">
      <button (click)="filter.set(null)" [class]="chipClass(filter() === null)">
        {{ 'common.all' | translate }} <span class="text-ink-faint">{{ goals().length }}</span>
      </button>
      @for (s of statuses; track s.value) {
        <button (click)="filter.set(s.value)" [class]="chipClass(filter() === s.value)">
          <span class="h-2 w-2 rounded-full inline-block" [style.background]="s.color"></span>
          {{ s.labelKey | translate }} <span class="text-ink-faint">{{ countFor(s.value) }}</span>
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else if (filtered().length === 0) {
      <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
        {{ (filter() ? 'learning.noGoalsFiltered' : 'learning.noGoals') | translate }}
      </div>
    } @else {
      <div class="space-y-4">
        @for (goal of filtered(); track goal.id) {
          <div data-tile class="rounded-card border border-edge bg-card p-5"
            [class.opacity-70]="goal.status === 'done'">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="font-semibold text-lg truncate">{{ goal.title }}</h2>
                  <span class="inline-flex items-center gap-1.5 rounded-full border border-edge-strong px-2.5 py-0.5 text-xs">
                    <span class="h-2 w-2 rounded-full" [style.background]="statusColor(goal.status)"></span>
                    {{ statusLabelKey(goal.status) | translate }}
                  </span>
                </div>
                <p class="text-ink-muted text-sm mt-0.5">
                  @if (goal.target_date) {
                    {{ 'learning.targetDate' | translate: { date: formatDate(goal.target_date) } }}
                    @if (goal.description) { · }
                  }
                  {{ goal.description }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                @for (s of statuses; track s.value) {
                  @if (s.value !== goal.status) {
                    <button (click)="changeStatus(goal, s.value)"
                      class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field">
                      {{ ('learning.setStatus.' + s.value) | translate }}
                    </button>
                  }
                }
                <button (click)="openForm(goal)" [title]="'common.edit' | translate"
                  class="text-ink-faint hover:text-ink px-1"><lucide-icon name="pencil" [size]="15" /></button>
                <button (click)="remove(goal)" [title]="'common.delete' | translate"
                  class="text-ink-faint hover:text-danger px-1"><lucide-icon name="trash-2" [size]="15" /></button>
              </div>
            </div>

            <!-- Progress -->
            @if (goal.milestones.length > 0) {
              <div class="mt-3 flex items-center gap-3">
                <div class="h-2 flex-1 rounded-full bg-field overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                    [style.background]="statusColor(goal.status)"
                    [style.width.%]="progressPct(goal)"></div>
                </div>
                <span class="text-xs text-ink-muted tabular-nums shrink-0">
                  {{ doneCount(goal) }} / {{ goal.milestones.length }}
                </span>
              </div>
            }

            <!-- Milestones -->
            <ul class="mt-3 space-y-1.5">
              @for (m of goal.milestones; track m.id) {
                <li class="flex items-center gap-3 text-sm rounded-control border border-edge px-3 py-2">
                  <button (click)="toggle(m)"
                    [class]="'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ' +
                      (m.done ? 'bg-accent border-accent' : 'border-edge-strong hover:border-accent')"
                    [title]="(m.done ? 'learning.markOpen' : 'learning.markDone') | translate">
                    @if (m.done) { <lucide-icon name="check" [size]="13" /> }
                  </button>
                  <span class="min-w-0 flex-1 truncate" [class.line-through]="m.done" [class.text-ink-faint]="m.done">
                    {{ m.title }}
                  </span>
                  @if (m.due_date) {
                    <span class="text-xs text-ink-faint tabular-nums shrink-0"
                      [class.text-danger]="!m.done && isOverdue(m.due_date)">
                      {{ formatDate(m.due_date) }}
                    </span>
                  }
                  <button (click)="removeMilestone(goal, m)" [title]="'common.delete' | translate"
                    class="text-ink-faint hover:text-danger px-1 shrink-0"><lucide-icon name="trash-2" [size]="14" /></button>
                </li>
              }
            </ul>

            <!-- Inline milestone add -->
            <form class="mt-2 flex gap-2" (ngSubmit)="addMilestone(goal)">
              <input [name]="'newMilestone' + goal.id" [(ngModel)]="newMilestone[goal.id]"
                [placeholder]="'learning.milestonePlaceholder' | translate"
                class="min-w-0 flex-1 rounded-control bg-field border border-edge-strong px-3 py-1.5 text-sm" />
              <input [name]="'newMilestoneDue' + goal.id" type="date" [(ngModel)]="newMilestoneDue[goal.id]"
                class="rounded-control bg-field border border-edge-strong px-3 py-1.5 text-sm" />
              <button type="submit" [disabled]="!(newMilestone[goal.id] || '').trim()"
                class="inline-flex items-center gap-1 rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field disabled:opacity-50">
                <lucide-icon name="plus" [size]="14" /> {{ 'learning.addMilestone' | translate }}
              </button>
            </form>
          </div>
        }
      </div>
    }

    <!-- Goal add/edit modal -->
    @if (showForm()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showForm.set(false)">
        <div class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">
            {{ (editing() ? 'learning.form.editTitle' : 'learning.form.newTitle') | translate }}
          </h2>
          @if (error()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">{{ error() }}</p>
          }
          <form class="space-y-4" (ngSubmit)="submit()">
            <div>
              <label for="goalTitle" class="block text-sm text-ink-soft mb-1">{{ 'learning.form.title' | translate }}</label>
              <input id="goalTitle" name="goalTitle" required [(ngModel)]="fTitle"
                [placeholder]="'learning.form.titlePlaceholder' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="goalTarget" class="block text-sm text-ink-soft mb-1">{{ 'learning.form.targetDate' | translate }}</label>
              <input id="goalTarget" name="goalTarget" type="date" [(ngModel)]="fTargetDate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="goalDesc" class="block text-sm text-ink-soft mb-1">{{ 'learning.form.description' | translate }}</label>
              <textarea id="goalDesc" name="goalDesc" rows="3" [(ngModel)]="fDescription"
                [placeholder]="'common.optional' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2"></textarea>
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
export class LearningPage {
  private readonly api = inject(LearningApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  readonly statuses = GOAL_STATUSES;
  private readonly today = new Date().toISOString().slice(0, 10);

  readonly loading = signal(true);
  readonly goals = signal<LearningGoal[]>([]);
  readonly filter = signal<GoalStatus | null>(null);

  readonly showForm = signal(false);
  readonly editing = signal<LearningGoal | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  fTitle = '';
  fDescription = '';
  fTargetDate = '';
  newMilestone: Record<number, string> = {};
  newMilestoneDue: Record<number, string> = {};

  readonly filtered = computed(() => {
    const f = this.filter();
    return f ? this.goals().filter((g) => g.status === f) : this.goals();
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.listGoals().subscribe({
      next: (goals) => {
        this.goals.set(goals);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: () => this.loading.set(false),
    });
  }

  chipClass(active: boolean): string {
    return (
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ' +
      (active
        ? 'border-accent bg-nav-active text-nav-active-ink'
        : 'border-edge-strong text-ink-soft hover:bg-field-soft')
    );
  }

  countFor(status: GoalStatus): number {
    return this.goals().filter((g) => g.status === status).length;
  }

  statusColor(status: GoalStatus): string {
    return GOAL_STATUSES.find((s) => s.value === status)?.color ?? '#64748b';
  }

  statusLabelKey(status: GoalStatus): string {
    return GOAL_STATUSES.find((s) => s.value === status)?.labelKey ?? status;
  }

  doneCount(goal: LearningGoal): number {
    return goal.milestones.filter((m) => m.done).length;
  }

  progressPct(goal: LearningGoal): number {
    if (goal.milestones.length === 0) return 0;
    return (this.doneCount(goal) / goal.milestones.length) * 100;
  }

  isOverdue(iso: string): boolean {
    return iso < this.today;
  }

  formatDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(this.language.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  changeStatus(goal: LearningGoal, status: GoalStatus): void {
    this.api.changeStatus(goal.id, status).subscribe({ next: () => this.load() });
  }

  toggle(milestone: Milestone): void {
    this.api.toggleMilestone(milestone.id).subscribe({ next: () => this.load() });
  }

  addMilestone(goal: LearningGoal): void {
    const title = (this.newMilestone[goal.id] || '').trim();
    if (!title) return;
    this.api
      .addMilestone(goal.id, { title, due_date: this.newMilestoneDue[goal.id] || null })
      .subscribe({
        next: () => {
          this.newMilestone[goal.id] = '';
          this.newMilestoneDue[goal.id] = '';
          this.load();
        },
      });
  }

  removeMilestone(goal: LearningGoal, milestone: Milestone): void {
    if (!confirm(this.translate.instant('learning.deleteMilestoneConfirm', { title: milestone.title })))
      return;
    this.api.deleteMilestone(milestone.id).subscribe({ next: () => this.load() });
  }

  openForm(goal: LearningGoal | null): void {
    this.editing.set(goal);
    this.error.set(null);
    this.fTitle = goal?.title ?? '';
    this.fDescription = goal?.description ?? '';
    this.fTargetDate = goal?.target_date ?? '';
    this.showForm.set(true);
  }

  submit(): void {
    if (!this.fTitle.trim()) {
      this.error.set(this.translate.instant('learning.errors.required'));
      return;
    }
    const payload = {
      title: this.fTitle.trim(),
      description: this.fDescription.trim() || null,
      target_date: this.fTargetDate || null,
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.editing();
    const req = editing
      ? this.api.updateGoal(editing.id, payload)
      : this.api.createGoal({ ...payload, milestones: [] });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('learning.errors.save')));
      },
    });
  }

  remove(goal: LearningGoal): void {
    if (!confirm(this.translate.instant('learning.deleteConfirm', { title: goal.title }))) return;
    this.api.deleteGoal(goal.id).subscribe({ next: () => this.load() });
  }
}
