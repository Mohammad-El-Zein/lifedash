import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';
import { SearchApiService } from '../../core/api/search-api.service';
import { AuthStore } from '../../core/auth/auth.store';
import { LanguageService } from '../../core/i18n/language.service';
import { MODULES, ModuleInfo, SearchHit } from '../../core/models';
import { eur } from '../../core/format';
import { FxModal } from '../../shared/animations';

/** Quick-create actions. `route` + `?new=1` is picked up by the target page
 * (see shared/deep-link.ts), which opens its own create modal. */
const QUICK_ACTIONS: { module: string; labelKey: string; route: string }[] = [
  { module: 'finance', labelKey: 'palette.actions.newTransaction', route: '/finance' },
  { module: 'jobs', labelKey: 'palette.actions.newApplication', route: '/jobs' },
  { module: 'fitness', labelKey: 'palette.actions.newWorkout', route: '/fitness' },
  { module: 'meals', labelKey: 'palette.actions.newMeal', route: '/meals' },
  { module: 'calendar', labelKey: 'palette.actions.newEvent', route: '/calendar' },
  { module: 'habits', labelKey: 'palette.actions.newHabit', route: '/habits' },
  { module: 'learning', labelKey: 'palette.actions.newGoal', route: '/learning' },
];

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 220;

interface PaletteItem {
  key: string;
  label: string;
  /** Right-hand context: entity label, amount, date — already formatted. */
  meta: string | null;
  icon: string;
  route: string;
  queryParams: Record<string, string>;
}

interface PaletteGroup {
  titleKey: string;
  items: { item: PaletteItem; index: number }[];
}

/**
 * Subsequence match used for the local (command) half of the palette: "nwtx"
 * matches "New transaction". Returns a score where lower is better — tight,
 * early matches win — or null when the query isn't contained at all.
 */
export function fuzzyScore(text: string, query: string): number | null {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return 0;

  let score = 0;
  let cursor = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    score += found - cursor;
    cursor = found + 1;
  }
  return score + cursor;
}

@Component({
  selector: 'app-command-palette',
  imports: [TranslatePipe, LucideAngularModule, FxModal],
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
  template: `
    @if (open()) {
      <div
        class="fx-fade fixed inset-0 z-[60] flex items-start justify-center bg-backdrop p-4 pt-[12vh]"
        (click)="close()"
      >
        <div
          class="w-full max-w-xl overflow-hidden rounded-card border border-edge-strong bg-card shadow-modal"
          fxModal
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-3 border-b border-edge px-4">
            <lucide-icon name="search" [size]="18" class="text-ink-faint shrink-0" />
            <input
              #queryInput
              type="search"
              class="flex-1 bg-transparent py-4 text-base outline-none placeholder:text-ink-faint"
              [placeholder]="'palette.placeholder' | translate"
              [value]="query()"
              (input)="onQuery($any($event.target).value)"
              autocomplete="off"
              spellcheck="false"
            />
            @if (searching()) {
              <span class="text-xs text-ink-faint">{{ 'palette.searching' | translate }}</span>
            }
          </div>

          <div #list class="max-h-[50vh] overflow-y-auto py-2">
            @for (group of groups(); track group.titleKey) {
              <p class="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                {{ group.titleKey | translate }}
              </p>
              @for (entry of group.items; track entry.item.key) {
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
                  [class.bg-nav-active]="entry.index === activeIndex()"
                  [class.text-nav-active-ink]="entry.index === activeIndex()"
                  [attr.data-active]="entry.index === activeIndex()"
                  (mouseenter)="activeIndex.set(entry.index)"
                  (click)="activate(entry.item)"
                >
                  <lucide-icon [name]="entry.item.icon" [size]="16" class="shrink-0 opacity-80" />
                  <span class="min-w-0 flex-1 truncate">{{ entry.item.label }}</span>
                  @if (entry.item.meta) {
                    <span class="shrink-0 text-xs text-ink-faint">{{ entry.item.meta }}</span>
                  }
                </button>
              }
            } @empty {
              <p class="px-4 py-6 text-center text-sm text-ink-muted">
                {{ 'palette.empty' | translate }}
              </p>
            }
          </div>

          <div class="flex items-center gap-4 border-t border-edge px-4 py-2 text-[11px] text-ink-faint">
            <span>↑↓ {{ 'palette.hints.navigate' | translate }}</span>
            <span>↵ {{ 'palette.hints.select' | translate }}</span>
            <span>esc {{ 'palette.hints.close' | translate }}</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  private readonly api = inject(SearchApiService);
  private readonly store = inject(AuthStore);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  readonly open = signal(false);
  readonly query = signal('');
  readonly searching = signal(false);
  readonly activeIndex = signal(0);
  private readonly hits = signal<SearchHit[]>([]);

  /** Guards against a slow earlier response overwriting a newer one. */
  private searchSeq = 0;
  private debounce?: ReturnType<typeof setTimeout>;

  private readonly modules = computed<ModuleInfo[]>(() => {
    const enabled = this.store.user()?.enabled_modules;
    const routable = MODULES.filter((module) => module.route);
    return enabled ? routable.filter((module) => enabled.includes(module.key)) : routable;
  });

  private readonly commandItems = computed<{ actions: PaletteItem[]; navigation: PaletteItem[] }>(
    () => {
      // Labels are translated eagerly so the fuzzy filter can match what the
      // user actually sees; re-read when the language changes.
      this.language.lang();
      const available = this.modules();
      const navigation = available.map((module) => ({
        key: `nav:${module.key}`,
        label: this.translate.instant(module.labelKey),
        meta: null,
        icon: module.icon,
        route: module.route as string,
        queryParams: {},
      }));
      const actions = QUICK_ACTIONS.filter((action) =>
        available.some((module) => module.key === action.module),
      ).map((action) => ({
        key: `action:${action.module}`,
        label: this.translate.instant(action.labelKey),
        meta: null,
        icon: 'plus',
        route: action.route,
        queryParams: { new: '1' },
      }));
      return { actions, navigation };
    },
  );

  private readonly resultItems = computed<PaletteItem[]>(() =>
    this.hits().map((hit, position) => ({
      key: `hit:${hit.module}:${hit.entity}:${hit.id}:${position}`,
      label: hit.title || this.translate.instant('palette.untitled'),
      meta: this.metaFor(hit),
      icon: MODULES.find((module) => module.key === hit.module)?.icon ?? 'search',
      route: MODULES.find((module) => module.key === hit.module)?.route ?? '/dashboard',
      queryParams: this.paramsFor(hit),
    })),
  );

  readonly groups = computed<PaletteGroup[]>(() => {
    const term = this.query().trim();
    const { actions, navigation } = this.commandItems();
    const filter = (items: PaletteItem[]) =>
      items
        .map((item) => ({ item, score: fuzzyScore(item.label, term) }))
        .filter((entry): entry is { item: PaletteItem; score: number } => entry.score !== null)
        .sort((a, b) => a.score - b.score)
        .map((entry) => entry.item);

    const sections: { titleKey: string; items: PaletteItem[] }[] = [
      { titleKey: 'palette.groups.actions', items: filter(actions) },
      { titleKey: 'palette.groups.navigation', items: filter(navigation) },
      { titleKey: 'palette.groups.results', items: this.resultItems() },
    ];

    let index = 0;
    return sections
      .filter((section) => section.items.length > 0)
      .map((section) => ({
        titleKey: section.titleKey,
        items: section.items.map((item) => ({ item, index: index++ })),
      }));
  });

  private readonly flatItems = computed(() =>
    this.groups().flatMap((group) => group.items.map((entry) => entry.item)),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      // Focus once the dialog exists, and keep the highlight in view while
      // arrowing through a long result list.
      const input = this.queryInput()?.nativeElement;
      if (input && document.activeElement !== input) input.focus();
      this.activeIndex();
      const active = this.list()?.nativeElement.querySelector('[data-active="true"]');
      // Optional call: jsdom (and older browsers) have no scrollIntoView.
      active?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (!this.open()) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        const item = this.flatItems()[this.activeIndex()];
        if (item) {
          event.preventDefault();
          this.activate(item);
        }
        break;
      }
    }
  }

  toggle(): void {
    this.open() ? this.close() : this.openPalette();
  }

  openPalette(): void {
    this.query.set('');
    this.hits.set([]);
    this.searching.set(false);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  close(): void {
    clearTimeout(this.debounce);
    this.searching.set(false);
    this.open.set(false);
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
    clearTimeout(this.debounce);

    const term = value.trim();
    if (term.length < MIN_SEARCH_LENGTH) {
      this.searchSeq++; // drop any in-flight response
      this.hits.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.debounce = setTimeout(() => this.runSearch(term), SEARCH_DEBOUNCE_MS);
  }

  activate(item: PaletteItem): void {
    this.close();
    void this.router.navigate([item.route], { queryParams: item.queryParams });
  }

  private move(delta: number): void {
    const count = this.flatItems().length;
    if (count === 0) return;
    this.activeIndex.set((this.activeIndex() + delta + count) % count);
  }

  private runSearch(term: string): void {
    const seq = ++this.searchSeq;
    this.api.search(term).subscribe({
      next: (response) => {
        if (seq !== this.searchSeq) return;
        this.hits.set(response.results);
        this.searching.set(false);
      },
      error: () => {
        if (seq !== this.searchSeq) return;
        this.hits.set([]);
        this.searching.set(false);
      },
    });
  }

  private metaFor(hit: SearchHit): string | null {
    const parts = [this.translate.instant(`palette.entities.${hit.entity}`)];
    if (hit.subtitle) parts.push(hit.subtitle);
    if (hit.amount !== null) parts.push(eur(Number(hit.amount)));
    if (hit.date) parts.push(this.formatDate(hit.date));
    return parts.join(' · ');
  }

  private formatDate(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(this.language.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  /** Context the target page picks up via shared/deep-link.ts. */
  private paramsFor(hit: SearchHit): Record<string, string> {
    switch (hit.module) {
      case 'calendar':
        return hit.date ? { date: hit.date } : {};
      case 'finance':
        if (hit.entity === 'recurring') return { tab: 'plan' };
        return hit.date ? { month: `${hit.date.slice(0, 8)}01` } : {};
      case 'meals':
        if (hit.entity === 'dish') return { tab: 'dishes' };
        if (hit.entity === 'ingredient') return { tab: 'ingredients' };
        return hit.date ? { day: hit.date } : {};
      default:
        return {};
    }
  }
}
