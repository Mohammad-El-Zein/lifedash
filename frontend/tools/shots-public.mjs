// Screenshots of the logged-out pages (landing, login, register), which
// shots.mjs cannot cover because it signs in first.
//   node shots-public.mjs <outDir>
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:4200';
const ROUTES = ['/', '/login', '/register'];
const VIEWPORTS = [
  { name: 'phone-375', width: 375, height: 812, dsf: 3, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, dsf: 2, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, dsf: 1, mobile: false },
];

const outDir = process.argv[2] ?? 'shots-public';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await context.newPage();

  for (const route of ROUTES) {
    const slug = route === '/' ? 'landing' : route.replace(/^\//, '');
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    // Give the lazily imported Three.js scene a moment to draw its first frame.
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${outDir}/${slug}__${vp.name}.png` });
    console.log(`${outDir}/${slug}__${vp.name}.png`);
  }

  await context.close();
}

await browser.close();
