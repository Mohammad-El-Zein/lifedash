import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FitnessApiService } from '../../core/api/fitness-api.service';
import { extractError } from '../../core/http-error';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { CATEGORY_COLORS, Exercise, ExerciseProgress, Workout } from '../../core/models';
import { FxModal, staggerTilesSoon } from '../../shared/animations';
import { EchartComponent } from '../../shared/echart.component';
import { WorkoutFormModal } from './workout-form.modal';

const DARK_SURFACE = '#12152a'; // effective glass-card surface over the night canvas
const LINE_COLOR = CATEGORY_COLORS[0];

@Component({
  selector: 'app-fitness-page',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, EchartComponent, FxModal, WorkoutFormModal],
  template: `
    <header class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">{{ 'fitness.title' | translate }}</h1>
        <p class="text-ink-muted mt-1">{{ 'fitness.count' | translate: { n: workouts().length } }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button (click)="openExercises()"
          class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field transition-colors">
          {{ 'fitness.manageExercises' | translate }}
        </button>
        <button (click)="openWorkoutForm(null)"
          class="inline-flex items-center gap-1.5 rounded-control bg-accent hover:bg-accent-hover px-4 py-2 text-sm font-medium transition-colors">
          <lucide-icon name="plus" [size]="16" /> {{ 'fitness.newWorkout' | translate }}
        </button>
      </div>
    </header>

    @if (loading()) {
      <p class="text-ink-muted">{{ 'common.loading' | translate }}</p>
    } @else {
      <!-- Progress chart -->
      @if (exercises().length > 0) {
        <div data-tile class="mb-6 rounded-card border border-edge bg-card p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 class="font-semibold inline-flex items-center gap-2">
              <span class="icon-chip"><lucide-icon name="trending-up" [size]="16" /></span>
              {{ 'fitness.progressTitle' | translate }}
            </h2>
            <select name="progressExercise" [ngModel]="selectedExerciseId()"
              (ngModelChange)="selectExercise($event)"
              class="rounded-control bg-field border border-edge-strong px-3 py-1.5 text-sm">
              @for (ex of exercises(); track ex.id) {
                <option [ngValue]="ex.id">{{ ex.name }}</option>
              }
            </select>
          </div>
          @if (progress(); as prog) {
            @if (prog.points.length > 0) {
              <div class="h-64">
                <app-echart [option]="chartOption()" />
              </div>
            } @else {
              <p class="text-sm text-ink-faint py-10 text-center">{{ 'fitness.noProgress' | translate }}</p>
            }
          }
        </div>
      }

      <!-- Workout list -->
      @if (workouts().length === 0) {
        <div class="rounded-card border border-edge bg-card p-10 text-center text-ink-faint">
          {{ 'fitness.noWorkouts' | translate }}
        </div>
      } @else {
        <div class="space-y-3">
          @for (workout of workouts(); track workout.id) {
            <div data-tile class="rounded-card border border-edge bg-card p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="font-semibold text-lg truncate">{{ workout.name }}</h2>
                    <span class="text-sm text-ink-muted tabular-nums">{{ formatDate(workout.date) }}</span>
                  </div>
                  @if (workout.notes) {
                    <p class="text-sm text-ink-muted mt-0.5">{{ workout.notes }}</p>
                  }
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button (click)="openWorkoutForm(workout)"
                    class="rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field">
                    {{ 'common.edit' | translate }}
                  </button>
                  <button (click)="removeWorkout(workout)"
                    class="rounded-control border border-danger-edge text-danger px-3 py-1.5 text-sm hover:bg-danger-surface">
                    {{ 'common.delete' | translate }}
                  </button>
                </div>
              </div>
              @if (workout.sets.length > 0) {
                <ul class="mt-3 border-t border-edge pt-3 space-y-1.5">
                  @for (group of groupedSets(workout); track group.exerciseId) {
                    <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                      <span class="font-medium">{{ group.name }}</span>
                      <span class="text-ink-muted tabular-nums">{{ group.summary }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="mt-3 border-t border-edge pt-3 text-sm text-ink-faint">
                  {{ 'fitness.noSets' | translate }}
                </p>
              }
            </div>
          }
        </div>
      }
    }

    <!-- Workout create/edit modal -->
    @if (showWorkoutForm()) {
      <app-workout-form-modal
        [exercises]="exercises()"
        [workout]="editingWorkout()"
        (closed)="showWorkoutForm.set(false)"
        (saved)="onWorkoutSaved()"
        (exercisesChanged)="loadExercises()"
      />
    }

    <!-- Exercises modal -->
    @if (showExercises()) {
      <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="showExercises.set(false)">
        <div class="w-full max-w-md rounded-card border border-edge-strong bg-card p-6 shadow-modal" fxModal (click)="$event.stopPropagation()">
          <h2 class="text-xl font-semibold mb-4">{{ 'fitness.exercises.title' | translate }}</h2>
          @if (exerciseError()) {
            <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
              {{ exerciseError() }}
            </p>
          }
          @if (exercises().length === 0) {
            <p class="text-sm text-ink-faint mb-4">{{ 'fitness.exercises.empty' | translate }}</p>
          } @else {
            <ul class="mb-4 space-y-1.5 max-h-64 overflow-y-auto">
              @for (ex of exercises(); track ex.id) {
                <li class="flex items-center gap-3 text-sm rounded-control border border-edge px-3 py-2">
                  <span class="min-w-0 flex-1 truncate">
                    {{ ex.name }}
                    @if (ex.muscle_group) { <span class="text-ink-faint">· {{ ex.muscle_group }}</span> }
                  </span>
                  <button (click)="startEditExercise(ex)" [title]="'common.edit' | translate"
                    class="text-ink-faint hover:text-ink px-1"><lucide-icon name="pencil" [size]="15" /></button>
                  <button (click)="removeExercise(ex)" [title]="'common.delete' | translate"
                    class="text-ink-faint hover:text-danger px-1"><lucide-icon name="trash-2" [size]="15" /></button>
                </li>
              }
            </ul>
          }
          <form class="space-y-3 border-t border-edge pt-4" (ngSubmit)="submitExercise()">
            <p class="text-sm font-medium text-ink-soft">
              {{ (editingExercise() ? 'fitness.exercises.editTitle' : 'fitness.exercises.addTitle') | translate }}
            </p>
            <div class="flex gap-2">
              <input id="exName" name="exName" required [(ngModel)]="exName"
                [placeholder]="'fitness.exercises.name' | translate"
                class="min-w-0 flex-1 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
              <input id="exMuscle" name="exMuscle" [(ngModel)]="exMuscle"
                [placeholder]="'fitness.exercises.muscleGroup' | translate"
                class="w-36 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
            </div>
            <div class="flex justify-end gap-2">
              @if (editingExercise()) {
                <button type="button" (click)="cancelEditExercise()"
                  class="rounded-control border border-edge-strong px-4 py-2 text-sm text-ink-soft hover:bg-field">
                  {{ 'common.cancel' | translate }}
                </button>
              }
              <button type="submit" [disabled]="savingExercise() || !exName.trim()"
                class="rounded-control bg-accent hover:bg-accent-hover disabled:opacity-50 px-4 py-2 text-sm font-medium">
                {{ (savingExercise() ? 'common.saving' : editingExercise() ? 'common.update' : 'common.save') | translate }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class FitnessPage {
  private readonly api = inject(FitnessApiService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly themeService = inject(ThemeService);

  readonly loading = signal(true);
  readonly workouts = signal<Workout[]>([]);
  readonly exercises = signal<Exercise[]>([]);

  readonly selectedExerciseId = signal<number | null>(null);
  readonly progress = signal<ExerciseProgress | null>(null);

  readonly showWorkoutForm = signal(false);
  readonly editingWorkout = signal<Workout | null>(null);

  readonly showExercises = signal(false);
  readonly editingExercise = signal<Exercise | null>(null);
  readonly savingExercise = signal(false);
  readonly exerciseError = signal<string | null>(null);
  exName = '';
  exMuscle = '';

  private readonly exerciseNames = computed(
    () => new Map(this.exercises().map((e) => [e.id, e.name])),
  );

  readonly chartOption = computed(() => {
    const dark = this.themeService.effective() === 'dark';
    const points = this.progress()?.points ?? [];
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#161a30' : '#ffffff',
        borderColor: dark ? 'rgba(255,255,255,0.14)' : '#e3e6ef',
        textStyle: { color: dark ? '#eef0fb' : '#171c2e' },
        valueFormatter: (v: number) => `${v} kg`,
      },
      grid: { left: 48, right: 20, top: 24, bottom: 32 },
      xAxis: {
        type: 'category',
        data: points.map((p) => this.formatDate(p.date)),
        axisLine: { lineStyle: { color: dark ? 'rgba(255,255,255,0.25)' : '#c3c8d6' } },
        axisLabel: { color: dark ? '#9aa0bd' : '#5b6172' },
      },
      yAxis: {
        type: 'value',
        name: 'kg',
        nameTextStyle: { color: dark ? '#9aa0bd' : '#5b6172' },
        axisLabel: { color: dark ? '#9aa0bd' : '#5b6172' },
        splitLine: { lineStyle: { color: dark ? 'rgba(255,255,255,0.08)' : '#eceef5' } },
        scale: true,
      },
      series: [
        {
          type: 'line',
          data: points.map((p) => Number(p.top_weight)),
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 3, color: LINE_COLOR },
          itemStyle: {
            color: LINE_COLOR,
            borderColor: dark ? DARK_SURFACE : '#ffffff',
            borderWidth: 2,
          },
          areaStyle: { color: dark ? 'rgba(57,135,229,0.18)' : 'rgba(57,135,229,0.10)' },
        },
      ],
    };
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.listWorkouts().subscribe({
      next: (workouts) => {
        this.workouts.set(workouts);
        this.loading.set(false);
        staggerTilesSoon(this.host.nativeElement);
      },
      error: () => this.loading.set(false),
    });
    this.loadExercises();
  }

  loadExercises(): void {
    this.api.listExercises().subscribe({
      next: (exercises) => {
        this.exercises.set(exercises);
        const selected = this.selectedExerciseId();
        if (selected === null || !exercises.some((e) => e.id === selected)) {
          this.selectExercise(exercises[0]?.id ?? null);
        } else {
          this.loadProgress(selected);
        }
      },
    });
  }

  selectExercise(id: number | null): void {
    this.selectedExerciseId.set(id);
    if (id === null) {
      this.progress.set(null);
      return;
    }
    this.loadProgress(id);
  }

  private loadProgress(id: number): void {
    this.api.progress(id).subscribe({ next: (prog) => this.progress.set(prog) });
  }

  groupedSets(workout: Workout): { exerciseId: number; name: string; summary: string }[] {
    const names = this.exerciseNames();
    const groups: { exerciseId: number; name: string; summary: string }[] = [];
    for (const set of workout.sets) {
      const rep = set.weight_kg === null ? `${set.reps}` : `${set.reps}×${Number(set.weight_kg)} kg`;
      const last = groups[groups.length - 1];
      if (last && last.exerciseId === set.exercise_id) {
        last.summary += ` · ${rep}`;
      } else {
        groups.push({
          exerciseId: set.exercise_id,
          name: names.get(set.exercise_id) ?? `#${set.exercise_id}`,
          summary: rep,
        });
      }
    }
    return groups;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  openWorkoutForm(workout: Workout | null): void {
    this.editingWorkout.set(workout);
    this.showWorkoutForm.set(true);
  }

  onWorkoutSaved(): void {
    this.showWorkoutForm.set(false);
    this.load();
  }

  removeWorkout(workout: Workout): void {
    if (!confirm(this.translate.instant('fitness.deleteWorkoutConfirm', { name: workout.name }))) return;
    this.api.deleteWorkout(workout.id).subscribe({ next: () => this.load() });
  }

  // --- Exercises modal -------------------------------------------------------

  openExercises(): void {
    this.exerciseError.set(null);
    this.cancelEditExercise();
    this.showExercises.set(true);
  }

  startEditExercise(exercise: Exercise): void {
    this.editingExercise.set(exercise);
    this.exName = exercise.name;
    this.exMuscle = exercise.muscle_group ?? '';
  }

  cancelEditExercise(): void {
    this.editingExercise.set(null);
    this.exName = '';
    this.exMuscle = '';
  }

  submitExercise(): void {
    const name = this.exName.trim();
    if (!name) return;
    const payload = { name, muscle_group: this.exMuscle.trim() || null };
    this.savingExercise.set(true);
    this.exerciseError.set(null);
    const editing = this.editingExercise();
    const req = editing
      ? this.api.updateExercise(editing.id, payload)
      : this.api.createExercise(payload);
    req.subscribe({
      next: () => {
        this.savingExercise.set(false);
        this.cancelEditExercise();
        this.loadExercises();
      },
      error: (err) => {
        this.savingExercise.set(false);
        this.exerciseError.set(
          extractError(err, this.translate.instant('fitness.errors.saveExercise')),
        );
      },
    });
  }

  removeExercise(exercise: Exercise): void {
    if (!confirm(this.translate.instant('fitness.deleteExerciseConfirm', { name: exercise.name })))
      return;
    this.exerciseError.set(null);
    this.api.deleteExercise(exercise.id).subscribe({
      next: () => this.loadExercises(),
      error: (err) => {
        this.exerciseError.set(
          extractError(err, this.translate.instant('fitness.errors.exerciseInUse')),
        );
      },
    });
  }
}
