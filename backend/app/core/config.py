from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Every feature module of the app. Users get all of them by default for now;
# the list on the user record is the hook for a later freemium model.
ALL_MODULES = ["calendar", "finance", "fitness", "meals", "jobs", "learning", "habits"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = "postgresql+psycopg://lifedash:lifedash@localhost:5432/lifedash"
    secret_key: str = "dev-only-secret-key-change-me-in-production-0000"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:4200"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
