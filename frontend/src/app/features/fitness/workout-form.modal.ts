import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FitnessApiService } from '../../core/api/fitness-api.service';
import { extractError } from '../../core/http-error';
import { Exercise, Workout, WorkoutPayload } from '../../core/models';
import { FxModal } from '../../shared/animations';

interface SetRow {
  exercise_id: number | null;
  reps: number | null;
  weight: number | null;
}

@Component({
  selector: 'app-workout-form-modal',
  imports: [FormsModule, TranslatePipe, LucideAngularModule, FxModal],
  template: `
    <div class="fx-fade fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" (click)="closed.emit()">
      <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-card border border-edge-strong bg-card p-6 shadow-modal"
        fxModal (click)="$event.stopPropagation()">
        <h2 class="text-xl font-semibold mb-4">
          {{ (workout() ? 'fitness.form.editTitle' : 'fitness.form.newTitle') | translate }}
        </h2>
        @if (error()) {
          <p class="fx-pop text-sm text-danger bg-danger-surface border border-danger-edge rounded-control px-3 py-2 mb-4">
            {{ error() }}
          </p>
        }
        <form class="space-y-4" (ngSubmit)="submit()">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="wName" class="block text-sm text-ink-soft mb-1">{{ 'fitness.form.name' | translate }}</label>
              <input id="wName" name="wName" required [(ngModel)]="fName"
                [placeholder]="'fitness.form.namePlaceholder' | translate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
            <div>
              <label for="wDate" class="block text-sm text-ink-soft mb-1">{{ 'fitness.form.date' | translate }}</label>
              <input id="wDate" name="wDate" type="date" required [(ngModel)]="fDate"
                class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
            </div>
          </div>
          <div>
            <label for="wNotes" class="block text-sm text-ink-soft mb-1">{{ 'fitness.form.notes' | translate }}</label>
            <input id="wNotes" name="wNotes" [(ngModel)]="fNotes" [placeholder]="'common.optional' | translate"
              class="w-full rounded-control bg-field border border-edge-strong px-3 py-2" />
          </div>

          <!-- Sets -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="block text-sm font-medium text-ink-soft">{{ 'fitness.form.sets' | translate }}</span>
              <button type="button" (click)="addRow()"
                class="inline-flex items-center gap-1 rounded-control border border-edge-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-field">
                <lucide-icon name="plus" [size]="14" /> {{ 'fitness.form.addSet' | translate }}
              </button>
            </div>
            @if (exercises().length === 0) {
              <p class="text-sm text-ink-faint rounded-control border border-edge px-3 py-2">
                {{ 'fitness.form.noExercises' | translate }}
              </p>
            }
            @if (rows().length === 0 && exercises().length > 0) {
              <p class="text-sm text-ink-faint rounded-control border border-edge px-3 py-2">
                {{ 'fitness.form.noSetsYet' | translate }}
              </p>
            }
            <div class="space-y-2">
              @for (row of rows(); track $index; let i = $index) {
                <div class="flex items-center gap-2">
                  <span class="w-6 text-right text-sm text-ink-faint tabular-nums shrink-0">{{ i + 1 }}.</span>
                  <select [name]="'setExercise' + i" required [ngModel]="row.exercise_id"
                    (ngModelChange)="patchRow(i, { exercise_id: $event })"
                    class="min-w-0 flex-1 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm">
                    <option [ngValue]="null" disabled>{{ 'fitness.form.exercise' | translate }}</option>
                    @for (ex of exercises(); track ex.id) {
                      <option [ngValue]="ex.id">{{ ex.name }}</option>
                    }
                  </select>
                  <input [name]="'setReps' + i" type="number" min="1" max="1000" required
                    [ngModel]="row.reps" (ngModelChange)="patchRow(i, { reps: $event })"
                    [placeholder]="'fitness.form.reps' | translate"
                    class="w-20 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm tabular-nums" />
                  <div class="relative">
                    <input [name]="'setWeight' + i" type="number" min="0" max="9999" step="0.5"
                      [ngModel]="row.weight" (ngModelChange)="patchRow(i, { weight: $event })"
                      [placeholder]="'fitness.form.weight' | translate"
                      class="w-28 rounded-control bg-field border border-edge-strong px-3 py-2 pr-9 text-sm tabular-nums" />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">kg</span>
                  </div>
                  <button type="button" (click)="duplicateRow(i)" [title]="'fitness.form.duplicateSet' | translate"
                    class="text-ink-faint hover:text-ink px-1 shrink-0"><lucide-icon name="plus" [size]="15" /></button>
                  <button type="button" (click)="removeRow(i)" [title]="'common.delete' | translate"
                    class="text-ink-faint hover:text-danger px-1 shrink-0"><lucide-icon name="trash-2" [size]="15" /></button>
                </div>
              }
            </div>
          </div>

          <!-- Quick exercise creation -->
          <details class="rounded-control border border-edge px-3 py-2">
            <summary class="cursor-pointer text-sm text-ink-muted hover:text-ink">
              {{ 'fitness.form.quickExercise' | translate }}
            </summary>
            <div class="mt-3 flex gap-2">
              <input name="quickExName" [(ngModel)]="quickExName"
                [placeholder]="'fitness.exercises.name' | translate"
                class="min-w-0 flex-1 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
              <input name="quickExMuscle" [(ngModel)]="quickExMuscle"
                [placeholder]="'fitness.exercises.muscleGroup' | translate"
                class="w-32 rounded-control bg-field border border-edge-strong px-3 py-2 text-sm" />
              <button type="button" (click)="createQuickExercise()"
                [disabled]="creatingExercise() || !quickExName.trim()"
                class="rounded-control border border-edge-strong px-3 py-2 text-sm text-ink-soft hover:bg-field disabled:opacity-50 shrink-0">
                {{ 'common.save' | translate }}
              </button>
            </div>
          </details>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" (click)="closed.emit()"
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
  `,
})
export class WorkoutFormModal {
  private readonly api = inject(FitnessApiService);
  private readonly translate = inject(TranslateService);

  readonly exercises = input.required<Exercise[]>();
  readonly workout = input.required<Workout | null>();
  readonly closed = output<void>();
  readonly saved = output<void>();
  readonly exercisesChanged = output<void>();

  readonly rows = signal<SetRow[]>([]);
  readonly saving = signal(false);
  readonly creatingExercise = signal(false);
  readonly error = signal<string | null>(null);

  fName = '';
  fDate = '';
  fNotes = '';
  quickExName = '';
  quickExMuscle = '';

  ngOnInit(): void {
    const workout = this.workout();
    this.fName = workout?.name ?? '';
    this.fDate = workout?.date ?? new Date().toISOString().slice(0, 10);
    this.fNotes = workout?.notes ?? '';
    this.rows.set(
      (workout?.sets ?? []).map((s) => ({
        exercise_id: s.exercise_id,
        reps: s.reps,
        weight: s.weight_kg === null ? null : Number(s.weight_kg),
      })),
    );
  }

  addRow(): void {
    const last = this.rows()[this.rows().length - 1];
    this.rows.update((rows) => [
      ...rows,
      { exercise_id: last?.exercise_id ?? this.exercises()[0]?.id ?? null, reps: null, weight: null },
    ]);
  }

  duplicateRow(index: number): void {
    this.rows.update((rows) => {
      const copy = { ...rows[index] };
      return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
    });
  }

  removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  patchRow(index: number, patch: Partial<SetRow>): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  createQuickExercise(): void {
    const name = this.quickExName.trim();
    if (!name) return;
    this.creatingExercise.set(true);
    this.error.set(null);
    this.api.createExercise({ name, muscle_group: this.quickExMuscle.trim() || null }).subscribe({
      next: (exercise) => {
        this.creatingExercise.set(false);
        this.quickExName = '';
        this.quickExMuscle = '';
        this.exercisesChanged.emit();
        // Point empty selects at the new exercise so it's immediately usable.
        this.rows.update((rows) =>
          rows.map((row) => (row.exercise_id === null ? { ...row, exercise_id: exercise.id } : row)),
        );
      },
      error: (err) => {
        this.creatingExercise.set(false);
        this.error.set(extractError(err, this.translate.instant('fitness.errors.saveExercise')));
      },
    });
  }

  submit(): void {
    if (!this.fName.trim() || !this.fDate) {
      this.error.set(this.translate.instant('fitness.errors.required'));
      return;
    }
    const rows = this.rows();
    if (rows.some((r) => r.exercise_id === null || !r.reps || r.reps < 1)) {
      this.error.set(this.translate.instant('fitness.errors.incompleteSets'));
      return;
    }
    const payload: WorkoutPayload = {
      date: this.fDate,
      name: this.fName.trim(),
      notes: this.fNotes.trim() || null,
      sets: rows.map((r) => ({
        exercise_id: r.exercise_id!,
        reps: r.reps!,
        weight_kg: r.weight === null || r.weight === undefined ? null : String(r.weight),
      })),
    };
    this.saving.set(true);
    this.error.set(null);
    const editing = this.workout();
    const req = editing ? this.api.updateWorkout(editing.id, payload) : this.api.createWorkout(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractError(err, this.translate.instant('fitness.errors.saveWorkout')));
      },
    });
  }
}
