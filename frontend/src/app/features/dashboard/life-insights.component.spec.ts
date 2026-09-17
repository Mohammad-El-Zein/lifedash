import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { InsightsResponse } from '../../core/models';
import { APP_ICONS } from '../../shared/icons';
import { LifeInsightsComponent } from './life-insights.component';

const RESPONSE: InsightsResponse = {
  available: true,
  generated_at: '2026-09-17T06:00:00Z',
  language: 'de',
  insights: [
    {
      title: 'Auswärts essen schlägt durch',
      body: 'Du hast diese Woche 3 Mahlzeiten geloggt, aber 120 € in der Kategorie Essen ausgegeben.',
      modules: ['finance', 'meals'],
      tone: 'warning',
    },
    {
      title: 'Training hält, Bewerbungen ziehen an',
      body: '3 Workouts wie letzte Woche, bei 4 statt 1 Bewerbung.',
      modules: ['fitness', 'jobs'],
      tone: 'positive',
    },
  ],
};

describe('LifeInsightsComponent', () => {
  let fixture: ComponentFixture<LifeInsightsComponent>;
  let insights: LifeInsightsComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LifeInsightsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ fallbackLang: 'en' }),
        importProvidersFrom(APP_ICONS),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LifeInsightsComponent);
    insights = fixture.componentInstance;
  });

  function load(response: InsightsResponse): void {
    fixture.detectChanges();
    http.expectOne('/api/insights').flush(response);
    fixture.detectChanges();
  }

  it('reads the cached set on load — a GET, never a refresh', () => {
    fixture.detectChanges();

    const request = http.expectOne('/api/insights');
    expect(request.request.method).toBe('GET');
    http.expectNone('/api/insights/refresh');
    request.flush(RESPONSE);
    fixture.detectChanges();

    expect(insights.insights().length).toBe(2);
  });

  it('renders one card per insight with its module icons', () => {
    load(RESPONSE);

    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Auswärts essen schlägt durch');
    expect(insights.iconsFor(RESPONSE.insights[0])).toEqual(['wallet', 'utensils']);
  });

  it('colours a warning differently from a positive insight', () => {
    load(RESPONSE);

    expect(insights.toneClass(RESPONSE.insights[0])).toContain('warn');
    expect(insights.toneClass(RESPONSE.insights[1])).toContain('success');
  });

  it('only calls the refresh endpoint when the button is pressed', () => {
    load(RESPONSE);
    http.verify(); // the initial load asked for nothing else

    fixture.nativeElement.querySelector('button').click();

    const request = http.expectOne('/api/insights/refresh');
    expect(request.request.method).toBe('POST');
    request.flush({ ...RESPONSE, insights: [RESPONSE.insights[1]] });
    fixture.detectChanges();

    expect(insights.insights().length).toBe(1);
  });

  it('hides itself entirely when the server has no API key', () => {
    load({ available: false, insights: [], generated_at: null, language: null });

    expect(insights.visible()).toBe(false);
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('explains an empty set instead of showing a blank row', () => {
    load({ available: true, insights: [], generated_at: null, language: null });

    expect(fixture.nativeElement.textContent).toContain('insights.empty');
  });

  it('shows a failure instead of pretending there are no insights', () => {
    fixture.detectChanges();
    http.expectOne('/api/insights').flush(
      { detail: 'The AI service is currently unavailable' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    fixture.detectChanges();

    expect(insights.error()).toBe('The AI service is currently unavailable');
  });
});
