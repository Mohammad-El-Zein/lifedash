/**
 * Shared sizing and safety net for the two Three.js scenes (landing hero and
 * the auth pages' particle network).
 *
 * Both scenes move every vertex on the CPU each frame, so their cost scales
 * with the vertex count rather than with the GPU. A phone gets roughly a third
 * of the desktop detail and renders at device pixel ratio 1; a tablet sits in
 * between. On top of that a watchdog watches the real frame rate and stops the
 * animation if the device cannot keep up — the page keeps its static frame and
 * the CSS aurora behind it, which is what a reduced-motion visitor sees too.
 */

export interface FxQuality {
  /** Multiplier on the scene's vertex counts, 1 = full desktop detail. */
  detail: number;
  /** Cap for the renderer's pixel ratio. */
  pixelRatio: number;
}

/** Matches ViewportService's breakpoints; this runs before Angular DI is handy. */
export function fxQuality(): FxQuality {
  const width = typeof window === 'undefined' ? 1920 : window.innerWidth;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  if (width < 768) return { detail: 0.3, pixelRatio: 1 };
  if (width < 1280) return { detail: 0.6, pixelRatio: Math.min(dpr, 1.5) };
  return { detail: 1, pixelRatio: Math.min(dpr, 2) };
}

/** Scales a vertex count, never below `min` — a scene still has to look like one. */
export function scaleCount(base: number, detail: number, min = 8): number {
  return Math.max(min, Math.round(base * detail));
}

const WARMUP_FRAMES = 30;
const SAMPLE_FRAMES = 45;
const MIN_ACCEPTABLE_FPS = 24;

/**
 * Returns a function to call once per frame with the rAF timestamp. After a
 * warmup it averages the next stretch of frames and, if the result is below
 * roughly 24fps, calls `onSlow` exactly once so the caller can stop animating.
 */
export function frameRateWatchdog(onSlow: () => void): (time: number) => void {
  let frames = 0;
  let sampleStart = 0;
  let fired = false;

  return (time: number) => {
    if (fired) return;
    frames++;
    if (frames === WARMUP_FRAMES) {
      sampleStart = time;
      return;
    }
    if (frames === WARMUP_FRAMES + SAMPLE_FRAMES) {
      const elapsed = time - sampleStart;
      const fps = elapsed > 0 ? (SAMPLE_FRAMES * 1000) / elapsed : 60;
      if (fps < MIN_ACCEPTABLE_FPS) {
        fired = true;
        onSlow();
      }
    }
  };
}
