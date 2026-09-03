"""Core subpackage for engine, config, exceptions, and results."""
from cor_engine.core.config import COR_OUTPUT_DIR, COR_TEMP_DIR
from cor_engine.core.engine import CORExtractionEngine, CorExtractor, extract
from cor_engine.core.exceptions import CorEngineError, UnsupportedFileTypeError
from cor_engine.core.result import ExtractionResult, ExtractionStatus, PageExtraction, RawExtraction

__all__ = [
    "CORExtractionEngine",
    "CorExtractor",
    "extract",
    "ExtractionResult",
    "ExtractionStatus",
    "PageExtraction",
    "RawExtraction",
    "COR_OUTPUT_DIR",
    "COR_TEMP_DIR",
    "CorEngineError",
    "UnsupportedFileTypeError",
]
