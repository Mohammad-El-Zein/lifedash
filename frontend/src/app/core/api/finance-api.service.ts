import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Budget,
  Category,
  MonthSummary,
  MonthlyPlan,
  PaidStatus,
  RecurringPayload,
  RecurringTransaction,
  SavingsOverview,
  SavingsSettings,
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

  updateTransaction(id: number, payload: TransactionPayload): Observable<Transaction> {
    return this.http.put<Transaction>(`/api/finance/transactions/${id}`, payload);
  }

  setTransactionStatus(id: number, status: PaidStatus): Observable<Transaction> {
    return this.http.patch<Transaction>(`/api/finance/transactions/${id}/status`, { status });
  }

  listRecurring(): Observable<RecurringTransaction[]> {
    return this.http.get<RecurringTransaction[]>('/api/finance/recurring');
  }

  createRecurring(payload: RecurringPayload): Observable<RecurringTransaction> {
    return this.http.post<RecurringTransaction>('/api/finance/recurring', payload);
  }

  updateRecurring(id: number, payload: RecurringPayload): Observable<RecurringTransaction> {
    return this.http.put<RecurringTransaction>(`/api/finance/recurring/${id}`, payload);
  }

  deleteRecurring(id: number): Observable<void> {
    return this.http.delete<void>(`/api/finance/recurring/${id}`);
  }

  skipRecurringMonth(id: number, month: string): Observable<RecurringTransaction> {
    return this.http.post<RecurringTransaction>(`/api/finance/recurring/${id}/skips`, { month });
  }

  unskipRecurringMonth(id: number, month: string): Observable<RecurringTransaction> {
    return this.http.delete<RecurringTransaction>(`/api/finance/recurring/${id}/skips/${month}`);
  }

  monthlyPlan(month: string): Observable<MonthlyPlan> {
    return this.http.get<MonthlyPlan>('/api/finance/monthly-plan', {
      params: new HttpParams().set('month', month),
    });
  }

  savings(): Observable<SavingsOverview> {
    return this.http.get<SavingsOverview>('/api/finance/savings');
  }

  updateSavingsSettings(payload: SavingsSettings): Observable<SavingsSettings> {
    return this.http.put<SavingsSettings>('/api/finance/savings/settings', payload);
  }
}
