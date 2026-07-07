from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Every feature module of the app. Users get all of them by default for now;
# the list on the user record is the hook for a later freemium model.
ALL_MODULES = ["calendar", "finance", "fitness", "meals", "jobs", "learning", "habits"]

# Environments where the well-known dev secret is acceptable.
DEV_ENVIRONMENTS = {"dev", "development", "test"}
DEV_SECRET_KEY = "dev-only-secret-key-change-me-in-production-0000"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = "postgresql+psycopg://lifedash:lifedash@localhost:5432/lifedash"
    secret_key: str = DEV_SECRET_KEY

    @model_validator(mode="after")
    def _require_real_secret_outside_dev(self) -> "Settings":
        """The dev key is public (it's in the repo); silently falling back to it
        in production would make every JWT forgeable. Fail at startup instead."""
        if self.environment not in DEV_ENVIRONMENTS and self.secret_key == DEV_SECRET_KEY:
            raise ValueError(
                f"SECRET_KEY must be set explicitly when ENVIRONMENT is "
                f"'{self.environment}' (the built-in key is for development only)"
            )
        return self
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:4200"
    # Defaults target Azurite's well-known dev account (docker compose / local);
    # production overrides this with the real storage-account connection string.
    azure_storage_connection_string: str = (
        "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
        "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/"
        "KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
    )
    storage_container: str = "job-documents"
    avatar_container: str = "avatars"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
