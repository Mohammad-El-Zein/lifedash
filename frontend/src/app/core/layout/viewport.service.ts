import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/**
 * The three device classes the UI is designed for. The boundaries mirror
 * Tailwind's `md` (768px) and `xl` (1280px), so a template can express the
 * same split with `md:` / `xl:` utilities where plain CSS is enough — this
 * service is for the cases that need the breakpoint in TypeScript (different
 * markup, not just different styling).
 *
 *   handset  <768px   phone portrait — drawer navigation, single column
 *   rail     768px…1279px  tablet / small laptop — icon rail, denser layout
 *   desktop  >=1280px  full sidebar, widest layouts
 */
export type DeviceClass = 'handset' | 'rail' | 'desktop';

const RAIL_QUERY = '(min-width: 768px)';
const DESKTOP_QUERY = '(min-width: 1280px)';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly atLeastRail = this.watch(RAIL_QUERY);
  private readonly atLeastDesktop = this.watch(DESKTOP_QUERY);

  readonly device = computed<DeviceClass>(() =>
    this.atLeastDesktop() ? 'desktop' : this.atLeastRail() ? 'rail' : 'handset',
  );

  /** Phone portrait: no room for a permanent sidebar. */
  readonly isHandset = computed(() => this.device() === 'handset');
  /** Tablet / small laptop: sidebar collapses to an icon rail. */
  readonly isRail = computed(() => this.device() === 'rail');
  readonly isDesktop = computed(() => this.device() === 'desktop');

  /** Touch-first input — hover affordances cannot be relied on. */
  readonly isTouch = this.watch('(hover: none)');
  /** The user asked the OS to keep motion to a minimum. */
  readonly prefersReducedMotion = this.watch('(prefers-reduced-motion: reduce)');

  /**
   * A media query as a signal. Falls back to `false` where matchMedia is
   * missing (server-side rendering, jsdom in the unit tests).
   */
  private watch(query: string) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return signal(false).asReadonly();
    }
    const list = window.matchMedia(query);
    const matches = signal(list.matches);
    const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
    list.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => list.removeEventListener('change', onChange));
    return matches.asReadonly();
  }
}
