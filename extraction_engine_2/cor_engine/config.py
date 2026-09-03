"""Compatibility shim for cor_engine.config -> cor_engine.core.config."""
from cor_engine.core.config import (
    COR_OUTPUT_DIR,
    COR_TEMP_DIR,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    MAX_IMAGE_PIXELS,
    OCR_DEVICE,
    OCR_ENABLE_MKLDNN,
    OCR_LANGUAGE,
    OCR_USE_GPU,
    OCR_USE_ORIENTATION,
    PDF_MIN_TEXT_CHARS,
    PDF_RENDER_DPI,
    PROCESSING_TIMEOUT_SECONDS,
)

__all__ = [
    "COR_OUTPUT_DIR",
    "COR_TEMP_DIR",
    "MAX_FILE_SIZE_BYTES",
    "MAX_FILE_SIZE_MB",
    "MAX_IMAGE_PIXELS",
    "OCR_DEVICE",
    "OCR_ENABLE_MKLDNN",
    "OCR_LANGUAGE",
    "OCR_USE_GPU",
    "OCR_USE_ORIENTATION",
    "PDF_MIN_TEXT_CHARS",
    "PDF_RENDER_DPI",
    "PROCESSING_TIMEOUT_SECONDS",
]
