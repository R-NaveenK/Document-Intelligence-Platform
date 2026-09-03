"""Compatibility shim for cor_engine.extractor -> cor_engine.core.engine."""
from cor_engine.core.engine import CORExtractionEngine, CorExtractor, extract

__all__ = ["CORExtractionEngine", "CorExtractor", "extract"]
