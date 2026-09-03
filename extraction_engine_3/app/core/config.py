import os
from typing import List

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    HAS_PYDANTIC_SETTINGS = True
except ImportError:
    HAS_PYDANTIC_SETTINGS = False
    from pydantic import BaseModel

if HAS_PYDANTIC_SETTINGS:
    class Settings(BaseSettings):
        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore"
        )
        ENGINE_ID: str = "engine_3"
        ENGINE_VERSION: str = "1.0.0"
        API_HOST: str = "0.0.0.0"
        API_PORT: int = int(os.getenv("PORT", os.getenv("API_PORT", "5004")))
        LOG_LEVEL: str = "INFO"
        MAX_FILE_SIZE_BYTES: int = 50 * 1024 * 1024
        ALLOWED_EXTENSIONS: List[str] = ["pdf", "jpg", "jpeg", "png", "tif", "tiff", "xlsx", "xls", "docx", "doc"]
        ALLOWED_MIME_TYPES: List[str] = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword"
        ]
        ENABLE_PREPROCESSING: bool = True
        PREPROCESS_DESKEW: bool = True
        PREPROCESS_CONTRAST: bool = True
        PREPROCESS_DENOISE: bool = True
        OCR_LANGUAGES: List[str] = ["en"]
        USE_GPU: bool = False
        OCR_DET_DB_THRESH: float = 0.3
        OCR_DET_DB_BOX_THRESH: float = 0.5
        FALLBACK_TO_MOCK_IF_UNAVAILABLE: bool = True
        TEMP_DIR: str = os.getenv("TEMP_DIR", os.path.join(os.getcwd(), "temp_uploads"))
        RAW_EXTRACTION_DIR: str = os.getenv("RAW_EXTRACTION_DIR", os.path.join(os.getcwd(), "data", "raw_extraction"))
else:
    class Settings(BaseModel):
        ENGINE_ID: str = os.getenv("ENGINE_ID", "engine_3")
        ENGINE_VERSION: str = os.getenv("ENGINE_VERSION", "1.0.0")
        API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
        API_PORT: int = int(os.getenv("PORT", os.getenv("API_PORT", "5004")))
        LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
        MAX_FILE_SIZE_BYTES: int = int(os.getenv("MAX_FILE_SIZE_BYTES", 50 * 1024 * 1024))
        ALLOWED_EXTENSIONS: List[str] = ["pdf", "jpg", "jpeg", "png", "tif", "tiff", "xlsx", "xls", "docx", "doc"]
        ALLOWED_MIME_TYPES: List[str] = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/tiff",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword"
        ]
        ENABLE_PREPROCESSING: bool = True
        PREPROCESS_DESKEW: bool = True
        PREPROCESS_CONTRAST: bool = True
        PREPROCESS_DENOISE: bool = True
        OCR_LANGUAGES: List[str] = ["en"]
        USE_GPU: bool = False
        OCR_DET_DB_THRESH: float = 0.3
        OCR_DET_DB_BOX_THRESH: float = 0.5
        FALLBACK_TO_MOCK_IF_UNAVAILABLE: bool = True
        TEMP_DIR: str = os.getenv("TEMP_DIR", os.path.join(os.getcwd(), "temp_uploads"))
        RAW_EXTRACTION_DIR: str = os.getenv("RAW_EXTRACTION_DIR", os.path.join(os.getcwd(), "data", "raw_extraction"))

settings = Settings()
