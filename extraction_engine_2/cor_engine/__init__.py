"""COR Independent Document Extraction Engine.

Primary OCR technology: PaddleOCR + open-source extraction libraries.
Primary output: Raw unstructured text (.txt file artifact).
"""
from cor_engine.core.engine import CORExtractionEngine, CorExtractor, extract
from cor_engine.core.result import (
    ExtractionResult,
    ExtractionStatus,
    PageExtraction,
    RawExtraction,
)
from cor_engine.core.exceptions import (
    CorEngineError,
    DocConversionError,
    DocProcessingError,
    DocxProcessingError,
    EmptyExtractionError,
    InvalidFileError,
    MissingFileError,
    OcrError,
    OutputWriteError,
    PdfProcessingError,
    ProcessingTimeoutError,
    SecurityError,
    UnsupportedFileTypeError,
)
from cor_engine.routing.file_detector import DocumentType, FileTypeDetector
from cor_engine.routing.file_router import FileRouter
from cor_engine.output.raw_writer import RawTextWriter

__version__ = "1.0.0"
__engine_name__ = "COR"

__all__ = [
    "CORExtractionEngine",
    "CorExtractor",
    "extract",
    "ExtractionResult",
    "ExtractionStatus",
    "PageExtraction",
    "RawExtraction",
    "DocumentType",
    "FileTypeDetector",
    "FileRouter",
    "RawTextWriter",
    "CorEngineError",
    "UnsupportedFileTypeError",
    "MissingFileError",
    "InvalidFileError",
    "PdfProcessingError",
    "DocProcessingError",
    "DocxProcessingError",
    "OcrError",
    "OutputWriteError",
    "EmptyExtractionError",
    "ProcessingTimeoutError",
    "SecurityError",
    "DocConversionError",
]
