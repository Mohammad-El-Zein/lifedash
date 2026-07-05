from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import ALL_MODULES
from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(255))
    job_title: Mapped[str | None] = mapped_column(String(200))
    bio: Mapped[str | None] = mapped_column(String(1000))
    avatar_blob_name: Mapped[str | None] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="user")
    enabled_modules: Mapped[list[str]] = mapped_column(JSON, default=lambda: list(ALL_MODULES))
    is_active: Mapped[bool] = mapped_column(default=True)

    @property
    def has_avatar(self) -> bool:
        return self.avatar_blob_name is not None
