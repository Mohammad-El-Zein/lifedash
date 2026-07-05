import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Budget,
  Category,
  MonthSummary,
  Transaction,
  TransactionPayload,
} from '../models';

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private readonly http = inject(HttpClient);

  listCategories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/finance/categories');
  }

  createCategory(name: string, kind: 'income' | 'expense', color: string): Observable<Category> {
    return this.http.post<Category>('/api/finance/categories', { name, kind, color });
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`/api/finance/categories/${id}`);
  }

  listTransactions(month?: string): Observable<Transaction[]> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get<Transaction[]>('/api/finance/transactions', { params });
  }

  createTransaction(payload: TransactionPayload): Observable<Transaction> {
    return this.http.post<Transaction>('/api/finance/transactions', payload);
  }

  deleteTransaction(id: number): Observable<void> {
    return this.http.delete<void>(`/api/finance/transactions/${id}`);
  }

  listBudgets(month: string): Observable<Budget[]> {
    return this.http.get<Budget[]>('/api/finance/budgets', {
      params: new HttpParams().set('month', month),
    });
  }

  upsertBudget(categoryId: number, month: string, amount: number): Observable<Budget> {
    return this.http.put<Budget>('/api/finance/budgets', {
      category_id: categoryId,
      month,
      amount,
    });
  }

  summary(month: string): Observable<MonthSummary> {
    return this.http.get<MonthSummary>('/api/finance/summary', {
      params: new HttpParams().set('month', month),
    });
  }
}
