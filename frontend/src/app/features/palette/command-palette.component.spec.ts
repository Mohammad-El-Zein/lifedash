import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchResponse } from '../../core/models';
import { APP_ICONS } from '../../shared/icons';
import { CommandPaletteComponent, fuzzyScore } from './command-palette.component';

const RESULTS: SearchResponse = {
  query: 'wilo',
  results: [
    {
      module: 'jobs',
      entity: 'application',
      id: 7,
      title: 'Wilo SE',
      subtitle: 'Junior Software Engineer',
      amount: null,
      date: '2026-07-01',
    },
    {
      module: 'finance',
      entity: 'transaction',
      id: 12,
      title: 'Wilo parking garage',
      subtitle: null,
      amount: '-42.50',
      date: '2026-07-02',
    },
  ],
};

describe('fuzzyScore', () => {
  it('matches a subsequence and rejects anything else', () => {
    expect(fuzzyScore('New transaction', 'ntra')).not.toBeNull();
    expect(fuzzyScore('New transaction', 'zzz')).toBeNull();
  });

  it('ranks tighter, earlier matches first', () => {
    const tight = fuzzyScore('Finance', 'fin') as number;
    const loose = fuzzyScore('Fitness in ance', 'fin') as number;
    expect(tight).toBeLessThan(loose);
  });

  it('treats an empty query as a match for everything', () => {
    expect(fuzzyScore('Habits', '')).toBe(0);
  });
});

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let palette: CommandPaletteComponent;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
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
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(CommandPaletteComponent);
    palette = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function press(key: string, options: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
    fixture.detectChanges();
  }

  it('toggles on Ctrl+K and closes on Escape', () => {
    press('k', { ctrlKey: true });
    expect(palette.open()).toBe(true);

    press('Escape');
    expect(palette.open()).toBe(false);
  });

  it('also opens on Cmd+K', () => {
    press('k', { metaKey: true });
    expect(palette.open()).toBe(true);
  });

  it('offers navigation and quick actions before anything is typed', () => {
    palette.openPalette();
    fixture.detectChanges();

    const titles = palette.groups().map((group) => group.titleKey);
    expect(titles).toContain('palette.groups.actions');
    expect(titles).toContain('palette.groups.navigation');
    expect(titles).not.toContain('palette.groups.results');
  });

  it('does not call the API for a one-character query', () => {
    palette.openPalette();
    palette.onQuery('w');
    vi.advanceTimersByTime(500);

    http.expectNone('/api/search?q=w');
  });

  it('debounces the search and shows the hits it gets back', () => {
    palette.openPalette();
    palette.onQuery('wil');
    palette.onQuery('wilo');
    vi.advanceTimersByTime(300);

    http.expectNone('/api/search?q=wil'); // superseded before the debounce fired
    http.expectOne('/api/search?q=wilo').flush(RESULTS);
    fixture.detectChanges();

    const results = palette.groups().find((g) => g.titleKey === 'palette.groups.results');
    expect(results?.items.map((entry) => entry.item.label)).toEqual([
      'Wilo SE',
      'Wilo parking garage',
    ]);
  });

  it('ignores a stale response that arrives after a newer query', () => {
    palette.openPalette();
    palette.onQuery('wilo');
    vi.advanceTimersByTime(300);
    const stale = http.expectOne('/api/search?q=wilo');

    palette.onQuery('acme');
    vi.advanceTimersByTime(300);
    const fresh = http.expectOne('/api/search?q=acme');

    fresh.flush({ query: 'acme', results: [] });
    stale.flush(RESULTS);
    fixture.detectChanges();

    expect(palette.groups().some((g) => g.titleKey === 'palette.groups.results')).toBe(false);
  });

  it('navigates to the highlighted entry on Enter and closes', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    palette.openPalette();
    palette.onQuery('wilo');
    vi.advanceTimersByTime(300);
    http.expectOne('/api/search?q=wilo').flush(RESULTS);
    fixture.detectChanges();

    // Arrow down to the first data hit (the quick actions/navigation come first).
    const results = palette.groups().find((g) => g.titleKey === 'palette.groups.results');
    palette.activeIndex.set(results!.items[1].index);
    press('Enter');

    expect(navigate).toHaveBeenCalledWith(['/finance'], {
      queryParams: { month: '2026-07-01' },
    });
    expect(palette.open()).toBe(false);
  });

  it('sends ?new=1 for a quick action', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    palette.openPalette();
    fixture.detectChanges();

    const actions = palette.groups().find((g) => g.titleKey === 'palette.groups.actions');
    palette.activate(actions!.items[0].item);

    expect(navigate).toHaveBeenCalledWith(['/finance'], { queryParams: { new: '1' } });
  });

  it('wraps around when arrowing past the ends', () => {
    palette.openPalette();
    fixture.detectChanges();
    const count = palette.groups().reduce((sum, group) => sum + group.items.length, 0);

    press('ArrowUp');
    expect(palette.activeIndex()).toBe(count - 1);
    press('ArrowDown');
    expect(palette.activeIndex()).toBe(0);
  });
});
