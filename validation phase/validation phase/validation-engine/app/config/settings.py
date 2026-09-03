from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Validation Engine"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database Settings (Optional PostgreSQL)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/validation_db"
    USE_IN_MEMORY_REPO: bool = True

    # Config File Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    VALIDATION_RULES_PATH: Path = BASE_DIR / "config" / "validation_rules.yaml"
    RISK_RULES_PATH: Path = BASE_DIR / "config" / "risk_rules.yaml"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
