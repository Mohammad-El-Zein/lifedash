from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_within_bcrypt_limit(cls, v: str) -> str:
        # bcrypt silently ignores everything beyond 72 bytes, so reject longer
        # passwords instead of storing a credential the user can't rely on.
        if len(v.encode("utf-8")) > 72:
            raise ValueError("password must be at most 72 bytes (UTF-8)")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None
    job_title: str | None = None
    bio: str | None = None
    has_avatar: bool = False
    role: str
    enabled_modules: list[str]


class UserUpdate(BaseModel):
    """PATCH semantics: only fields present in the payload are applied."""

    full_name: str | None = Field(default=None, max_length=255)
    job_title: str | None = Field(default=None, max_length=200)
    bio: str | None = Field(default=None, max_length=1000)
    enabled_modules: list[str] | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
