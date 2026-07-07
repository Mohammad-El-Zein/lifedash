from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import auth, calendar, finance, fitness, habits, jobs, learning, meals, users

settings = get_settings()

app = FastAPI(
    title="LifeDash API",
    version="0.1.0",
    description="API-first backend for the LifeDash personal life dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(calendar.router)
app.include_router(finance.router)
app.include_router(fitness.router)
app.include_router(jobs.router)
app.include_router(meals.router)
app.include_router(learning.router)
app.include_router(habits.router)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
