"""Compatibility shim for cor_engine.router -> cor_engine.routing."""
from cor_engine.routing.file_detector import DocumentType, FileTypeDetector
from cor_engine.routing.file_router import FileRouter

# Aliases
SupportedFileType = DocumentType
detect_file_type = FileTypeDetector.detect

__all__ = [
    "DocumentType",
    "SupportedFileType",
    "FileTypeDetector",
    "FileRouter",
    "detect_file_type",
]
