"""Configuration settings for the COR extraction engine."""
import os
from pathlib import Path

# Base output directory for raw extracted .txt artifacts
DEFAULT_OUTPUT_DIR = Path("./data/cor_extractions")
COR_OUTPUT_DIR = Path(os.getenv("COR_OUTPUT_DIR", str(DEFAULT_OUTPUT_DIR))).resolve()

# Temp directory
DEFAULT_TEMP_DIR = Path("./data/temp")
COR_TEMP_DIR = Path(os.getenv("COR_TEMP_DIR", str(DEFAULT_TEMP_DIR))).resolve()

# PaddleOCR configuration
COR_OCR_LANGUAGE = os.getenv("COR_OCR_LANGUAGE", os.getenv("OCR_LANGUAGE", "en"))
COR_OCR_DEVICE = os.getenv("COR_OCR_DEVICE", os.getenv("OCR_DEVICE", "cpu"))
COR_OCR_USE_ORIENTATION = os.getenv("COR_OCR_USE_ORIENTATION", os.getenv("OCR_USE_ORIENTATION", "true")).lower() in ("true", "1", "yes")
COR_OCR_ENABLE_MKLDNN = os.getenv("COR_OCR_ENABLE_MKLDNN", os.getenv("OCR_ENABLE_MKLDNN", "false")).lower() in ("true", "1", "yes")

# Image preprocessing settings
COR_PREPROCESSING_ENABLED = os.getenv("COR_PREPROCESSING_ENABLED", "true").lower() in ("true", "1", "yes")
COR_CONTRAST_ENHANCEMENT = os.getenv("COR_CONTRAST_ENHANCEMENT", "true").lower() in ("true", "1", "yes")
COR_DENOISE = os.getenv("COR_DENOISE", "false").lower() in ("true", "1", "yes")

# PDF extraction settings
COR_PDF_RENDER_DPI = int(os.getenv("COR_PDF_RENDER_DPI", "200"))
COR_PDF_MIN_TEXT_CHARS = int(os.getenv("COR_PDF_MIN_TEXT_CHARS", "40"))
COR_PDF_MIN_ALPHANUMERIC_RATIO = float(os.getenv("COR_PDF_MIN_ALPHANUMERIC_RATIO", "0.45"))
COR_PDF_MAX_GARBAGE_RATIO = float(os.getenv("COR_PDF_MAX_GARBAGE_RATIO", "0.20"))

# File size & security limits
COR_MAX_FILE_SIZE_MB = int(os.getenv("COR_MAX_FILE_SIZE_MB", os.getenv("MAX_FILE_SIZE_MB", "50")))
MAX_FILE_SIZE_MB = COR_MAX_FILE_SIZE_MB
MAX_FILE_SIZE_BYTES = COR_MAX_FILE_SIZE_MB * 1024 * 1024
MAX_IMAGE_PIXELS = int(os.getenv("COR_MAX_IMAGE_PIXELS", "100000000"))
COR_PROCESSING_TIMEOUT_SECONDS = int(os.getenv("COR_PROCESSING_TIMEOUT_SECONDS", os.getenv("PROCESSING_TIMEOUT_SECONDS", "120")))
PROCESSING_TIMEOUT_SECONDS = COR_PROCESSING_TIMEOUT_SECONDS

# Backwards compatibility aliases
OCR_LANGUAGE = COR_OCR_LANGUAGE
OCR_DEVICE = COR_OCR_DEVICE
OCR_USE_GPU = (COR_OCR_DEVICE.lower() == "gpu")
OCR_USE_ORIENTATION = COR_OCR_USE_ORIENTATION
OCR_ENABLE_MKLDNN = COR_OCR_ENABLE_MKLDNN
PDF_RENDER_DPI = COR_PDF_RENDER_DPI
PDF_MIN_TEXT_CHARS = COR_PDF_MIN_TEXT_CHARS


