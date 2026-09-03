"""Compatibility shim for cor_engine.models -> cor_engine.core.result."""
from cor_engine.core.result import (
    ErrorCode,
    ExtractionResult,
    ExtractionStatus,
    PageExtraction,
    RawExtraction,
)

__all__ = ["ErrorCode", "ExtractionResult", "ExtractionStatus", "PageExtraction", "RawExtraction"]
