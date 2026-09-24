# Responsive verification tools

Ad-hoc scripts used to verify the responsive pass across handset, tablet and
desktop. They drive the running app rather than mocking it, so start the stack
first (`docker compose up -d` in the repo root) and install the driver:

```bash
cd frontend
npm i -D --no-save playwright-core   # deliberately not in package.json
node tools/<script>.mjs
```

There are no Playwright browsers installed; the scripts launch the system Edge
(`chromium.launch({ channel: 'msedge' })`).

All of them use one throwaway account, `responsive@lifedash.example.com`,
which `tools/shots.mjs` registers on first run.

## Checks

| Script | What it answers |
| --- | --- |
| `check-responsive.mjs` | Sweeps every route at 375/768/1440 and fails on horizontal overflow or a touch target under 44×44. The broadest net — run this one first. |
| `check-swipe.mjs` | Drives the handset calendar: day arrows, a real touch swipe, a vertical drag that must *not* change the day, and the week strip. |
| `check-fx.mjs` | Confirms the Three.js pixel-ratio tiers (1 / 1.5 / 2) by measuring the canvas drawing buffer against its CSS width, and that the frame-rate watchdog does not fire on a healthy machine. |

`check-responsive.mjs` deliberately excludes two things from the 44px rule: a
block `<label>` above its field (a caption, not a control) and calendar event
blocks (their height encodes duration).

## Screenshots

| Script | Pages |
| --- | --- |
| `shots.mjs <outDir> [routes...]` | Signed-in pages. `BOTTOM=1` adds a scrolled-to-end shot — the shell scrolls inside `<main>`, so Playwright's `fullPage` only ever captures the first screen. |
| `shots-public.mjs <outDir>` | Landing, login and register, which `shots.mjs` cannot reach because it signs in first. |

## Seeds

`seed.mjs` (calendar), `seed-more.mjs` (finance, jobs, habits, learning) and
`seed-fitness-meals.mjs` fill the throwaway account so the screenshots show
realistic content instead of empty states. Each skips a section that already
has rows, but they are not fully idempotent — re-running after a partial
failure can duplicate entries.
