// Verifies the Three.js quality tiers actually take effect, and that the
// frame-rate watchdog does not fire on a machine that copes fine.
//
// The renderer's drawing buffer is cssWidth * pixelRatio, so the canvas'
// intrinsic width is an observable proxy for the pixel-ratio cap.
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4200';
const CASES = [
  { name: 'phone-375', width: 375, height: 812, dsf: 3, expectedRatio: 1 },
  { name: 'tablet-768', width: 768, height: 1024, dsf: 2, expectedRatio: 1.5 },
  { name: 'desktop-1440', width: 1440, height: 900, dsf: 2, expectedRatio: 2 },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let failures = 0;

for (const c of CASES) {
  const context = await browser.newContext({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.dsf,
    isMobile: c.width < 768,
    hasTouch: c.width < 768,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const measured = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { intrinsic: canvas.width, css: Math.round(rect.width) };
  });

  if (!measured || measured.css === 0) {
    console.log(`FAIL  ${c.name}: no canvas rendered`);
    failures++;
  } else {
    const ratio = measured.intrinsic / measured.css;
    const ok = Math.abs(ratio - c.expectedRatio) < 0.15;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.name}: pixel ratio ${ratio.toFixed(2)} (expected ${c.expectedRatio})`,
    );
  }

  // Still animating after the watchdog's sample window? Compare two frames.
  const frameA = await page.locator('canvas').screenshot();
  await page.waitForTimeout(1200);
  const frameB = await page.locator('canvas').screenshot();
  const moving = !frameA.equals(frameB);
  if (!moving) failures++;
  console.log(`${moving ? 'PASS' : 'FAIL'}  ${c.name}: scene still animating after the watchdog window`);

  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
