// Responsive screenshot pass. Run from frontend/ so node resolves playwright-core.
//   node shots.mjs <outDir> [routes...]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:4200';
const EMAIL = 'responsive@lifedash.example.com';
const PASSWORD = 'responsive-pw-123';

const VIEWPORTS = [
  { name: 'phone-375', width: 375, height: 812, dsf: 3, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, dsf: 2, mobile: true },
  { name: 'desktop-1440', width: 1440, height: 900, dsf: 1, mobile: false },
];

const outDir = process.argv[2] ?? 'shots';
const routes = process.argv.slice(3);
if (!routes.length) routes.push('/dashboard');

async function ensureAccount() {
  const res = await fetch('http://localhost:8000/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, full_name: 'Responsive Tester' }),
  });
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`register failed: ${res.status} ${await res.text()}`);
  }
}

await ensureAccount();
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

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  for (const route of routes) {
    const slug = route.replace(/^\//, '').replace(/\//g, '-') || 'root';
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${outDir}/${slug}__${vp.name}.png` });
    console.log(`${outDir}/${slug}__${vp.name}.png`);

    // The shell scrolls inside <main>, not the document, so fullPage would only
    // ever capture the first screen. BOTTOM=1 adds a scrolled-to-end shot.
    if (process.env.BOTTOM === '1') {
      const scrolled = await page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main || main.scrollHeight <= main.clientHeight + 40) return false;
        main.scrollTop = main.scrollHeight;
        return true;
      });
      if (scrolled) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${outDir}/${slug}__${vp.name}__bottom.png` });
        console.log(`${outDir}/${slug}__${vp.name}__bottom.png`);
      }
    }
  }

  // Navigation open: the drawer on a handset, the expanded rail on a tablet.
  if (vp.width < 1280) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    const toggle = vp.width < 768 ? page.locator("header button").first() : page.locator("aside button").first();
    await toggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/nav-open__${vp.name}.png` });
    console.log(`${outDir}/nav-open__${vp.name}.png`);
  }

  await context.close();
}

await browser.close();
