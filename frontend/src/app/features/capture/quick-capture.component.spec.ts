import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { CaptureSuggestion } from '../../core/models';
import { APP_ICONS } from '../../shared/icons';
import { QuickCaptureComponent } from './quick-capture.component';

const FINANCE_SUGGESTION: CaptureSuggestion = {
  module: 'finance',
  confidence: 'high',
  summary: '50 € Ausgabe für Essen wird gespeichert.',
  finance: {
    kind: 'expense',
    amount: 50,
    description: 'Essen',
    date: '2026-09-17',
    category_id: null,
    category: 'Essen',
  },
  meal: null,
  event: null,
  job: null,
};

const MEAL_SUGGESTION: CaptureSuggestion = {
  module: 'meals',
  confidence: 'medium',
  summary: 'Müsli als Frühstück.',
  finance: null,
  meal: {
    name: 'Müsli',
    meal_type: 'breakfast',
    calories: 420,
    protein_g: 12,
    carbs_g: null,
    fat_g: null,
    date: '2026-09-17',
  },
  event: null,
  job: null,
};

describe('QuickCaptureComponent', () => {
  let fixture: ComponentFixture<QuickCaptureComponent>;
  let capture: QuickCaptureComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickCaptureComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ fallbackLang: 'en' }),
        importProvidersFrom(APP_ICONS),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(QuickCaptureComponent);
    capture = fixture.componentInstance;
    fixture.detectChanges();
  });

  function parseWith(suggestion: CaptureSuggestion, text = 'egal'): void {
    capture.openCapture();
    capture.text.set(text);
    capture.parse();
    http.expectOne('/api/capture/parse').flush(suggestion);
    fixture.detectChanges();
  }

  it('never calls the API while typing — only on submit', () => {
    capture.openCapture();
    capture.text.set('50 Euro');
    fixture.detectChanges();

    http.expectNone('/api/capture/parse');
  });

  it('refuses to submit an empty note', () => {
    capture.openCapture();
    capture.text.set('   ');

    expect(capture.canParse()).toBe(false);
    capture.parse();
    http.expectNone('/api/capture/parse');
  });

  it('sends the note and shows the suggestion for review', () => {
    capture.openCapture();
    capture.text.set('50 Euro für Essen ausgegeben heute');
    capture.parse();

    const request = http.expectOne('/api/capture/parse');
    expect(request.request.body).toEqual({ text: '50 Euro für Essen ausgegeben heute' });
    request.flush(FINANCE_SUGGESTION);
    fixture.detectChanges();

    expect(capture.phase()).toBe('review');
    expect(capture.form.kind).toBe('finance');
    expect(capture.form.amount).toBe(50);
    expect(capture.form.description).toBe('Essen');
    // The finance form needs the user's categories to offer a choice.
    http.expectOne('/api/finance/categories').flush([]);
  });

  it('does not save anything until the user confirms', () => {
    parseWith(FINANCE_SUGGESTION);
    http.expectOne('/api/finance/categories').flush([]);

    http.expectNone('/api/finance/transactions');
    expect(capture.phase()).toBe('review');
  });

  it('saves an edited suggestion through the normal module endpoint', () => {
    parseWith(FINANCE_SUGGESTION);
    http.expectOne('/api/finance/categories').flush([]);

    // The user corrects the amount before confirming.
    capture.form.amount = 42.5;
    capture.form.categoryId = null;
    capture.save();

    const request = http.expectOne('/api/finance/transactions');
    expect(request.request.body).toEqual({
      kind: 'expense',
      amount: 42.5,
      description: 'Essen',
      date: '2026-09-17',
      category_id: null,
    });
    request.flush({ id: 1 });
    fixture.detectChanges();

    expect(capture.phase()).toBe('saved');
  });

  it('creates the proposed category first when it is picked', () => {
    parseWith(FINANCE_SUGGESTION);
    http.expectOne('/api/finance/categories').flush([]);

    // The suggestion proposed a category the user does not have yet, so the
    // "create it" option is preselected.
    expect(capture.form.categoryId).toBe(capture.newCategory);
    capture.save();

    const created = http.expectOne('/api/finance/categories');
    expect(created.request.body).toEqual({ name: 'Essen', kind: 'expense', color: '#3987e5' });
    created.flush({ id: 9, name: 'Essen', kind: 'expense', color: '#3987e5' });

    const transaction = http.expectOne('/api/finance/transactions');
    expect(transaction.request.body.category_id).toBe(9);
  });

  it('routes a meal suggestion to the meals endpoint', () => {
    parseWith(MEAL_SUGGESTION);

    expect(capture.form.kind).toBe('meal');
    capture.save();

    const request = http.expectOne('/api/meals');
    expect(request.request.body).toEqual({
      date: '2026-09-17',
      meal_type: 'breakfast',
      name: 'Müsli',
      calories: 420,
      protein_g: 12,
      carbs_g: null,
      fat_g: null,
    });
  });

  it('offers no save button for an unclassifiable note', () => {
    parseWith({
      module: 'unknown',
      confidence: 'low',
      summary: 'Passt zu keinem Modul.',
      finance: null,
      meal: null,
      event: null,
      job: null,
    });

    expect(capture.form.kind).toBe('none');
    capture.save();
    http.expectNone('/api/finance/transactions');
  });

  it('surfaces a backend failure instead of pretending it worked', () => {
    capture.openCapture();
    capture.text.set('irgendwas');
    capture.parse();
    http.expectOne('/api/capture/parse').flush(
      { detail: 'AI features are not configured on this server' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();

    expect(capture.phase()).toBe('input');
    expect(capture.error()).toBe('AI features are not configured on this server');
  });
});
