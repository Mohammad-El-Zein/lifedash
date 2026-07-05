---
name: verify
description: Launch and drive LifeDash locally to verify changes end-to-end (compose stack, API drive, headless UI screenshots).
---

# Verifying LifeDash changes

## Launch

1. Docker Desktop must be running: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, poll `docker info`.
2. Only one stack can bind 5432/8000/4200 — stop other worktrees' stacks first
   (`docker compose stop` in their dir).
3. `docker compose up -d --build` in the repo root. The backend container runs
   `alembic upgrade head` on start — check `docker compose logs backend` for the
   migration lines and `Uvicorn running`.

## Drive the API

Backend: `http://localhost:8000`. Register via `POST /api/auth/register`
(`{email, password}` → `access_token`), then hit `/api/<module>/...` with the
Bearer header. httpx is available in `backend/.venv` (worktrees may need the
venv of another worktree, e.g. `.claude/worktrees/phase-1-foundation/backend/.venv`).

## Drive the UI (headless screenshots)

Frontend: `http://localhost:4200` (ng serve in the container, proxies /api).
No Playwright browsers are installed, but system Edge works:

```bash
cd frontend && npm i -D --no-save playwright-core
# script must run from frontend/ so node resolves the package
node script.mjs   # chromium.launch({ channel: 'msedge', headless: true })
```

Login form: `input[type=email]`, `input[type=password]`, `button[type=submit]`.
