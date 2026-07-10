from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Every feature module of the app. Users get all of them by default for now;
# the list on the user record is the hook for a later freemium model.
ALL_MODULES = ["calendar", "finance", "fitness", "meals", "jobs", "learning", "habits"]

# Environments where the well-known dev defaults are acceptable.
DEV_ENVIRONMENTS = {"dev", "development", "test"}
DEV_SECRET_KEY = "dev-only-secret-key-change-me-in-production-0000"
DEV_DATABASE_URL = "postgresql+psycopg://lifedash:lifedash@localhost:5432/lifedash"
# Azurite's well-known dev account (compose / local emulator).
DEV_STORAGE_CONNECTION_STRING = (
    "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/"
    "KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = DEV_DATABASE_URL
    secret_key: str = DEV_SECRET_KEY

    @model_validator(mode="after")
    def _require_real_config_outside_dev(self) -> "Settings":
        """The dev defaults are public (they're in the repo); silently falling
        back to them in production would forge JWTs / point at localhost /
        Azurite. Fail at startup instead of failing confusingly at runtime."""
        if self.environment in DEV_ENVIRONMENTS:
            return self
        dev_defaults = {
            "SECRET_KEY": self.secret_key == DEV_SECRET_KEY,
            "DATABASE_URL": self.database_url == DEV_DATABASE_URL,
            "AZURE_STORAGE_CONNECTION_STRING": "devstoreaccount1"
            in self.azure_storage_connection_string,
        }
        offending = [name for name, is_dev in dev_defaults.items() if is_dev]
        if offending:
            raise ValueError(
                f"{', '.join(offending)} must be set explicitly when ENVIRONMENT is "
                f"'{self.environment}' (the built-in defaults are for development only)"
            )
        return self
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:4200"
    # Defaults target Azurite's well-known dev account (docker compose / local);
    # production must override this — the validator above enforces it.
    azure_storage_connection_string: str = DEV_STORAGE_CONNECTION_STRING
    storage_container: str = "job-documents"
    avatar_container: str = "avatars"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
