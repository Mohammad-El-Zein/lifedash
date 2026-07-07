import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Exercise,
  ExercisePayload,
  ExerciseProgress,
  Workout,
  WorkoutPayload,
} from '../models';

@Injectable({ providedIn: 'root' })
export class FitnessApiService {
  private readonly http = inject(HttpClient);

  listExercises(): Observable<Exercise[]> {
    return this.http.get<Exercise[]>('/api/fitness/exercises');
  }

  createExercise(payload: ExercisePayload): Observable<Exercise> {
    return this.http.post<Exercise>('/api/fitness/exercises', payload);
  }

  updateExercise(id: number, payload: ExercisePayload): Observable<Exercise> {
    return this.http.put<Exercise>(`/api/fitness/exercises/${id}`, payload);
  }

  deleteExercise(id: number): Observable<void> {
    return this.http.delete<void>(`/api/fitness/exercises/${id}`);
  }

  progress(exerciseId: number): Observable<ExerciseProgress> {
    return this.http.get<ExerciseProgress>(`/api/fitness/exercises/${exerciseId}/progress`);
  }

  listWorkouts(): Observable<Workout[]> {
    return this.http.get<Workout[]>('/api/fitness/workouts');
  }

  createWorkout(payload: WorkoutPayload): Observable<Workout> {
    return this.http.post<Workout>('/api/fitness/workouts', payload);
  }

  updateWorkout(id: number, payload: WorkoutPayload): Observable<Workout> {
    return this.http.put<Workout>(`/api/fitness/workouts/${id}`, payload);
  }

  deleteWorkout(id: number): Observable<void> {
    return this.http.delete<void>(`/api/fitness/workouts/${id}`);
  }
}
