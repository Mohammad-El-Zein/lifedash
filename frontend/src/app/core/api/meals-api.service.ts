import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Ingredient,
  IngredientPayload,
  Meal,
  MealFromTemplatePayload,
  MealPayload,
  MealTemplate,
  TemplatePayload,
} from '../models';

@Injectable({ providedIn: 'root' })
export class MealsApiService {
  private readonly http = inject(HttpClient);

  list(date: string): Observable<Meal[]> {
    return this.http.get<Meal[]>('/api/meals', { params: new HttpParams().set('date', date) });
  }

  create(payload: MealPayload): Observable<Meal> {
    return this.http.post<Meal>('/api/meals', payload);
  }

  update(id: number, payload: MealPayload): Observable<Meal> {
    return this.http.put<Meal>(`/api/meals/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/meals/${id}`);
  }

  createFromTemplate(payload: MealFromTemplatePayload): Observable<Meal> {
    return this.http.post<Meal>('/api/meals/from-template', payload);
  }

  listIngredients(): Observable<Ingredient[]> {
    return this.http.get<Ingredient[]>('/api/meals/ingredients');
  }

  createIngredient(payload: IngredientPayload): Observable<Ingredient> {
    return this.http.post<Ingredient>('/api/meals/ingredients', payload);
  }

  updateIngredient(id: number, payload: IngredientPayload): Observable<Ingredient> {
    return this.http.put<Ingredient>(`/api/meals/ingredients/${id}`, payload);
  }

  deleteIngredient(id: number): Observable<void> {
    return this.http.delete<void>(`/api/meals/ingredients/${id}`);
  }

  listTemplates(): Observable<MealTemplate[]> {
    return this.http.get<MealTemplate[]>('/api/meals/templates');
  }

  createTemplate(payload: TemplatePayload): Observable<MealTemplate> {
    return this.http.post<MealTemplate>('/api/meals/templates', payload);
  }

  updateTemplate(id: number, payload: TemplatePayload): Observable<MealTemplate> {
    return this.http.put<MealTemplate>(`/api/meals/templates/${id}`, payload);
  }

  deleteTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`/api/meals/templates/${id}`);
  }
}
