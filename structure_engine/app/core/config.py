from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Structuring Engine"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 5002
    
    # Engine & Threshold Configurations
    FUZZY_MATCH_THRESHOLD: float = 75.0
    HIGH_CONFIDENCE_THRESHOLD: float = 0.65
    LOW_CONFIDENCE_THRESHOLD: float = 0.60
    MAX_CANDIDATES_PER_FIELD: int = 8
    MAX_TEXT_LENGTH_BYTES: int = 5242880  # 5MB max text payload
    MAX_REQUEST_LENGTH_CHARS: int = 1000
    CACHE_SIZE: int = 1024
    
    # Production Logging & Security
    LOG_LEVEL: str = "INFO"
    SANITIZE_LOG_DATA: bool = True
    
    # Persisted Raw Artifact Storage
    RAW_EXTRACTION_DIR: str = "data/raw_extraction"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
