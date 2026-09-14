from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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
    groq_api_key: str | None = None
    groq_vision_model: str = "qwen/qwen3.8-27b"
    # Falls back here only when Groq specifically rate-limits (HTTP 429) —
    # see gemini_vision.py and worker.py. Other Groq failures still fall
    # straight through to PaddleOCR as before.
    gemini_api_key: str | None = None
    # Pinned to a specific, verified-working model rather than the
    # "-latest" alias: that alias currently resolves to a model returning
    # 503 "high demand" on every request (verified directly against
    # Google's API, independent of anything in this codebase), while
    # gemini-3.5-flash responds normally. Revisit if -latest recovers.
    gemini_vision_model: str = "gemini-3.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()
