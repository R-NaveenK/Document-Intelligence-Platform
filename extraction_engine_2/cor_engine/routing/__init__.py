"""Routing subpackage for file detection and handler dispatch."""
from cor_engine.routing.file_detector import DocumentType, FileTypeDetector
from cor_engine.routing.file_router import FileRouter

__all__ = ["DocumentType", "FileTypeDetector", "FileRouter"]
