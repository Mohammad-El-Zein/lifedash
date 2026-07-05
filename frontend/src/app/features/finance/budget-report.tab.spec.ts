import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MonthSummary } from '../../core/models';
import { BudgetReportTab } from './budget-report.tab';

const SUMMARY: MonthSummary = {
  month: '2026-07-01',
  income_total: 0,
  expense_total: 470,
  net: -470,
  expenses_by_category: [
    { category_id: 1, name: 'Groceries', color: '#111111', spent: 320, budget: 300 },
    { category_id: 2, name: 'Transport', color: '#222222', spent: 80, budget: 120 },
    { category_id: 3, name: 'No budget', color: '#333333', spent: 50, budget: null },
    { category_id: null, name: 'Uncategorised', color: '#444444', spent: 20, budget: null },
  ],
};

describe('BudgetReportTab', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BudgetReportTab],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  function createWithSummary(): BudgetReportTab {
    const fixture = TestBed.createComponent(BudgetReportTab);
    fixture.componentRef.setInput('month', '2026-07-01');
    fixture.detectChanges();
    http.expectOne((req) => req.url === '/api/finance/summary').flush(SUMMARY);
    return fixture.componentInstance;
  }

  it('only reports categories that have a budget set', () => {
    const tab = createWithSummary();
    expect(tab.rows().map((r) => r.name)).toEqual(['Groceries', 'Transport']);
  });

  it('computes signed per-category differences (negative = over budget)', () => {
    const tab = createWithSummary();
    expect(tab.rows().map((r) => r.diff)).toEqual([-20, 40]);
  });

  it('totals budget, spent and difference across all budgeted categories', () => {
    const tab = createWithSummary();
    expect(tab.totals()).toEqual({ budget: 420, spent: 400, diff: 20 });
  });
});
