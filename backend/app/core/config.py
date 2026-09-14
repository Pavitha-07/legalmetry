from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    app_name: str = "LegalMetry API"
    environment: str = "development"

    database_url: str

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    minio_endpoint: str
    minio_root_user: str
    minio_root_password: str
    minio_bucket: str = "inspection-evidence"
    minio_secure: bool = False

    redis_url: str

    initial_supervisor_email: str | None = None
    initial_supervisor_password: str | None = None

    single_district_name: str = "Demo District"

    # Comma-separated list of allowed CORS origins.
    # Example:
    # CORS_ORIGINS=https://legalmetry.example.gov.in,https://www.legalmetry.example.gov.in
    # Local development:
    # CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
    cors_origins: list[str] = [
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]

    @field_validator("database_url", mode="before")
    @classmethod
    def _use_psycopg3(cls, v: object) -> object:
        if isinstance(v, str):
            if v.startswith("postgresql+psycopg2://"):
                return v.replace(
                    "postgresql+psycopg2://",
                    "postgresql+psycopg://",
                    1,
                )

            if v.startswith("postgresql://"):
                return v.replace(
                    "postgresql://",
                    "postgresql+psycopg://",
                    1,
                )

            if v.startswith("postgres://"):
                return v.replace(
                    "postgres://",
                    "postgresql+psycopg://",
                    1,
                )

        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, v: object) -> object:
        """
        Allow CORS_ORIGINS to be supplied as a comma-separated
        string in .env.

        Example:
        CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
        """
        if isinstance(v, str):
            return [
                origin.strip()
                for origin in v.split(",")
                if origin.strip()
            ]

        return v

    # Optional Groq configuration.
    # If unavailable, the system falls back to PaddleOCR.
    groq_api_key: str | None = None
    groq_vision_model: str = "qwen/qwen3.8-27b"

    # Optional Gemini fallback.
    # Used when Groq specifically rate-limits (HTTP 429).
    gemini_api_key: str | None = None
    gemini_vision_model: str = "gemini-1.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()