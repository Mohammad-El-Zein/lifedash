import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  GoalPayload,
  GoalStatus,
  LearningGoal,
  Milestone,
  MilestonePayload,
} from '../models';

@Injectable({ providedIn: 'root' })
export class LearningApiService {
  private readonly http = inject(HttpClient);

  listGoals(): Observable<LearningGoal[]> {
    return this.http.get<LearningGoal[]>('/api/learning/goals');
  }

  createGoal(payload: GoalPayload & { milestones: MilestonePayload[] }): Observable<LearningGoal> {
    return this.http.post<LearningGoal>('/api/learning/goals', payload);
  }

  updateGoal(id: number, payload: GoalPayload): Observable<LearningGoal> {
    return this.http.put<LearningGoal>(`/api/learning/goals/${id}`, payload);
  }

  changeStatus(id: number, status: GoalStatus): Observable<LearningGoal> {
    return this.http.post<LearningGoal>(`/api/learning/goals/${id}/status`, { status });
  }

  deleteGoal(id: number): Observable<void> {
    return this.http.delete<void>(`/api/learning/goals/${id}`);
  }

  addMilestone(goalId: number, payload: MilestonePayload): Observable<Milestone> {
    return this.http.post<Milestone>(`/api/learning/goals/${goalId}/milestones`, payload);
  }

  updateMilestone(
    id: number,
    payload: MilestonePayload & { done: boolean },
  ): Observable<Milestone> {
    return this.http.put<Milestone>(`/api/learning/milestones/${id}`, payload);
  }

  toggleMilestone(id: number): Observable<Milestone> {
    return this.http.post<Milestone>(`/api/learning/milestones/${id}/toggle`, {});
  }

  deleteMilestone(id: number): Observable<void> {
    return this.http.delete<void>(`/api/learning/milestones/${id}`);
  }
}
