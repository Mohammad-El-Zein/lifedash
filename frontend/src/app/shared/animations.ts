import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';
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

/**
 * Staggered entrance for elements that render after async data arrives:
 * waits two frames so Angular has flushed the DOM, then staggers the
 * host's `[data-tile]` descendants.
 */
export function staggerTilesSoon(host: Element): void {
  if (prefersReducedMotion()) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => staggerIn(Array.from(host.querySelectorAll('[data-tile]')))),
  );
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

/** Springy entrance for a modal card. */
export function modalIn(element: Element): void {
  if (prefersReducedMotion()) return;
  gsap.from(element, {
    autoAlpha: 0,
    y: 16,
    scale: 0.97,
    duration: 0.25,
    ease: 'power3.out',
    clearProps: 'all',
  });
}

/** Attribute directive: plays the modal entrance on the host element.
 *  Usage: `<div fxModal class="…modal card…">` */
@Directive({ selector: '[fxModal]' })
export class FxModal implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    modalIn(this.el.nativeElement);
  }
}
