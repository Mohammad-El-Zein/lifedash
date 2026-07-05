import gsap from 'gsap';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Staggered entrance for a group of elements (e.g. dashboard tiles). */
export function staggerIn(elements: Element[]): void {
  if (elements.length === 0 || prefersReducedMotion()) return;
  gsap.from(elements, {
    autoAlpha: 0,
    y: 24,
    duration: 0.5,
    ease: 'power2.out',
    stagger: 0.07,
    clearProps: 'all',
  });
}

/** Fade-and-rise entrance for a routed page. */
export function pageEnter(element: Element): void {
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    element,
    { autoAlpha: 0, y: 12 },
    { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' },
  );
}
