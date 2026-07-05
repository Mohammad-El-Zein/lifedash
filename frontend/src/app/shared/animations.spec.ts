import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageEnter, prefersReducedMotion, staggerIn } from './animations';

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches } as MediaQueryList),
  );
}

describe('animations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefersReducedMotion reflects the media query', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('pageEnter starts the element transparent, then animates it in', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    document.body.appendChild(el);
    pageEnter(el);
    expect(el.style.opacity).toBe('0');
    el.remove();
  });

  it('pageEnter is a no-op when reduced motion is preferred', () => {
    stubMatchMedia(true);
    const el = document.createElement('div');
    document.body.appendChild(el);
    pageEnter(el);
    expect(el.style.opacity).toBe('');
    el.remove();
  });

  it('staggerIn hides tiles initially, and skips when reduced motion is preferred', () => {
    stubMatchMedia(false);
    const tiles = [document.createElement('div'), document.createElement('div')];
    tiles.forEach((t) => document.body.appendChild(t));
    staggerIn(tiles);
    expect(tiles[0].style.opacity).toBe('0');

    stubMatchMedia(true);
    const still = document.createElement('div');
    document.body.appendChild(still);
    staggerIn([still]);
    expect(still.style.opacity).toBe('');

    [...tiles, still].forEach((t) => t.remove());
  });
});
