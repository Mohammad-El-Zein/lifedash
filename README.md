# LifeDash

A personal life dashboard — calendar, finances, fitness, meals, job applications,
learning goals and habits in one place. Built API-first as a full-stack portfolio
project with a clear path to a multi-tenant product.

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Alembic |
| Database | PostgreSQL 16 |
| Frontend | Angular 21 (standalone components, signals, zoneless) · Tailwind CSS 4 |
| Auth | JWT (register/login), role field & per-user module toggles built in |
| Local dev | Docker Compose (Postgres + FastAPI + Angular dev server) |
| CI/CD | GitHub Actions (lint → test → build → Docker images) |
| Cloud | Azure Container Apps · Azure Database for PostgreSQL · ACR (Bicep, `/infra`) |

## Getting started

```bash
docker compose up --build
```

- Frontend: http://localhost:4200 (Angular dev server with `/api` proxy)
- API: http://localhost:8000 · OpenAPI docs at http://localhost:8000/docs
- Database migrations run automatically when the backend starts.

First run: register an account at http://localhost:4200/register.

### Running tests

```bash
# Backend (from backend/, needs Python 3.12+)
pip install -r requirements-dev.txt
pytest

# Frontend (from frontend/)
npm ci
npm test -- --watch=false
```

## Project structure

```
backend/            FastAPI app
  app/models/       SQLAlchemy models — one file per module, every table has user_id
  app/routers/      /api/auth, /api/users, /api/calendar (more per phase)
  app/services/     Domain logic (e.g. recurring-event week expansion)
  alembic/          Database migrations
  tests/            Pytest suite (runs against in-memory SQLite)
frontend/           Angular app
  src/app/core/     Auth store/guard/interceptor, API services, shared models
  src/app/features/ Lazy-loaded feature areas (auth, shell, dashboard, calendar)
infra/              Bicep templates for Azure (see infra/README.md)
```

## Modules & roadmap

| Module | Status |
| --- | --- |
| 📅 Calendar — weekly view, recurring events, per-day exceptions | ✅ Phase 1 |
| 💶 Finance — transactions, budgets, ECharts dashboards | Phase 2 |
| 💼 Job applications — pipeline & status history | Phase 2 |
| ✨ GSAP animations | Phase 2 |
| 🏋️ Fitness · 🥗 Meals · 🎓 Learning · 🔥 Habits | Phase 3 |
| 🌐 Landing page with Three.js | Phase 3 |
| 🔌 Google Calendar sync · AI agent (Anthropic API) · payments | Phase 4 |

The database schema for **all** modules ships in Phase 1 so later phases only add
routers and UI. Users have a `role` and an `enabled_modules` list from day one
(freemium/multi-tenancy groundwork).

## Calendar recurrence model

Events are either one-off (`recurrence_days = null`, happens on `start_date`) or
repeat weekly on selected weekdays between `start_date` and an optional `end_date`.
Single occurrences can be **cancelled** or **moved** via exceptions
(`/api/calendar/events/{id}/exceptions`); `GET /api/calendar/week?start=…` returns
the fully expanded week. Full iCal RRULE support is a possible later upgrade.
