// Sweeps every route at every device class and reports two classes of defect
// that screenshots make easy to miss:
//
//   1. horizontal overflow — the page or an element sticking out past the
//      right edge, which on a phone means content you cannot reach
//   2. touch targets under 44x44 CSS px on a handset
//
// Inline links inside a paragraph are excluded from (2): they are text, and
// padding them to 44px would wreck the line rhythm.
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4200';
const EMAIL = 'responsive@lifedash.example.com';
const PASSWORD = 'responsive-pw-123';

const PRIVATE = ['/dashboard', '/calendar', '/finance', '/jobs', '/fitness', '/meals', '/learning', '/habits', '/profile'];
const PUBLIC = ['/', '/login', '/register'];

const VIEWPORTS = [
  { name: 'phone-375', width: 375, height: 812, touchAudit: true },
  { name: 'tablet-768', width: 768, height: 1024, touchAudit: false },
  { name: 'desktop-1440', width: 1440, height: 900, touchAudit: false },
];

const MIN_TOUCH = 44;
const TOLERANCE = 1; // sub-pixel layout rounding

const audit = () => {
  const results = { overflow: [], small: [] };

  // 1. Horizontal overflow, on the document and on the shell's scroll container.
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (docOverflow > 1) results.overflow.push({ what: 'document', by: docOverflow });
  const main = document.querySelector('main');
  if (main && main.scrollWidth - main.clientWidth > 1) {
    results.overflow.push({ what: 'main', by: main.scrollWidth - main.clientWidth });
  }

  // Elements sticking out past the viewport's right edge. Anything inside an
  // intentionally side-scrolling strip is fine, so skip those subtrees.
  const viewportWidth = document.documentElement.clientWidth;
  const scrollers = [...document.querySelectorAll('*')].filter((el) => {
    const style = getComputedStyle(el);
    return style.overflowX === 'auto' || style.overflowX === 'scroll';
  });
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (scrollers.some((s) => s !== el && s.contains(el))) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right > viewportWidth + 1) {
      results.overflow.push({
        what: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')}`,
        by: Math.round(rect.right - viewportWidth),
        text: (el.textContent || '').trim().slice(0, 40),
      });
      break; // one representative offender per page is enough to act on
    }
  }

  // 2. Touch targets.
  const interactive = document.querySelectorAll('button, a[href], input, select, textarea, label[for], summary');
  for (const el of interactive) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // Inline text links inside a paragraph are prose, not controls.
    if (el.tagName === 'A' && el.closest('p') && style.display.startsWith('inline')) continue;
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) continue;
    // A block <label> above its field is a caption. It stays clickable, but
    // padding every one to 44px would wreck the rhythm of a form.
    if (el.tagName === 'LABEL' && style.display === 'block') continue;
    // A calendar event's height encodes its duration — a 15-minute block
    // cannot be 44px tall without lying about when it ends.
    if (el.getAttribute('style')?.includes('height:')) continue;
    if (rect.height < 44 - 1 || rect.width < 44 - 1) {
      results.small.push({
        what: `${el.tagName.toLowerCase()}`,
        size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 32),
      });
    }
  }
  return results;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let problems = 0;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.width < 768,
    hasTouch: vp.width < 768,
  });
  const page = await context.newPage();

  console.log(`\n=== ${vp.name} ===`);

  for (const route of PUBLIC) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    report(route, await page.evaluate(audit), vp);
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  for (const route of PRIVATE) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    report(route, await page.evaluate(audit), vp);
  }

  await context.close();
}

function report(route, r, vp) {
  const lines = [];
  for (const o of r.overflow) lines.push(`    overflow: ${o.what} by ${o.by}px ${o.text ? `— "${o.text}"` : ''}`);
  if (vp.touchAudit) {
    const seen = new Set();
    for (const s of r.small) {
      const key = `${s.what}|${s.size}|${s.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`    small target: <${s.what}> ${s.size} — "${s.text}"`);
    }
  }
  problems += lines.length;
  console.log(`  ${lines.length ? 'ISSUES' : 'ok    '} ${route}`);
  for (const l of lines) console.log(l);
}

await browser.close();
console.log(problems ? `\n${problems} issue(s) found` : '\nno issues found');
