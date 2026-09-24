// Drives the handset calendar: arrows, week strip and a real touch swipe.
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4200';
const EMAIL = 'responsive@lifedash.example.com';
const PASSWORD = 'responsive-pw-123';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type=email]', EMAIL);
await page.fill('input[type=password]', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(/dashboard/);
await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const caption = () => page.locator('main header p').first().innerText();
const check = (label, actual, expected) =>
  console.log(`${actual === expected ? 'PASS' : 'FAIL'}  ${label}: ${actual}${actual === expected ? '' : ` (expected ${expected})`}`);

const start = await caption();
console.log(`start day: ${start}`);

await page.locator('main header button').nth(2).click(); // next-day arrow
await page.waitForTimeout(300);
const afterNext = await caption();
console.log(`after next arrow: ${afterNext}`);
check('next arrow moved a day', afterNext !== start, true);

await page.locator('main header button').nth(0).click(); // previous day
await page.waitForTimeout(300);
check('previous arrow came back', await caption(), start);

// Swipe left on the grid: should advance one day, same as the arrow.
const grid = page.locator('.touch-pan-y');
const box = await grid.boundingBox();
const y = box.y + box.height / 2;
await page.touchscreen.tap(box.x + box.width / 2, y); // ensure the page has focus
await page.waitForTimeout(200);
await page.mouse.move(box.x + box.width - 30, y);
await grid.dispatchEvent('touchstart', {
  changedTouches: [{ clientX: box.x + box.width - 30, clientY: y, identifier: 0 }],
});
await grid.dispatchEvent('touchend', {
  changedTouches: [{ clientX: box.x + 30, clientY: y, identifier: 0 }],
});
await page.waitForTimeout(300);
check('swipe left advanced a day', await caption(), afterNext);

// A mostly-vertical drag must not change the day.
const held = await caption();
await grid.dispatchEvent('touchstart', {
  changedTouches: [{ clientX: box.x + box.width / 2, clientY: box.y + 20, identifier: 0 }],
});
await grid.dispatchEvent('touchend', {
  changedTouches: [{ clientX: box.x + box.width / 2 - 60, clientY: box.y + 300, identifier: 0 }],
});
await page.waitForTimeout(300);
check('vertical drag kept the day', await caption(), held);

// Week strip: tapping Monday jumps to the first column.
await page.locator('button[aria-label="Tag wählen"]').first().click();
await page.waitForTimeout(300);
console.log(`after tapping Monday: ${await caption()}`);

await browser.close();
