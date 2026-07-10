from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import DEV_ENVIRONMENTS, get_settings
from app.routers import auth, calendar, finance, fitness, habits, jobs, learning, meals, users

settings = get_settings()
_is_dev = settings.environment in DEV_ENVIRONMENTS

app = FastAPI(
    title="LifeDash API",
    version="0.1.0",
    description="API-first backend for the LifeDash personal life dashboard.",
    # Don't publish the API schema / Swagger UI outside development.
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
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
