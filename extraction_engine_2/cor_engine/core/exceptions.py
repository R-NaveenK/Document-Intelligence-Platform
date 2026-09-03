"""Custom exceptions for the COR extraction engine."""
from typing import Optional


class CorEngineError(Exception):
    """Base exception for all COR extraction engine errors."""

    def __init__(self, message: str, error_code: str = "EXTRACTION_FAILED"):
        super().__init__(message)
        self.message = message
        self.error_code = error_code


class UnsupportedFileTypeError(CorEngineError):
    """Raised when the input document type is not supported."""

    def __init__(self, message: str = "Unsupported document file type"):
        super().__init__(message, error_code="UNSUPPORTED_FILE_TYPE")


class MissingFileError(CorEngineError):
    """Raised when the input document file cannot be found."""

    def __init__(self, message: str = "Input file not found"):
        super().__init__(message, error_code="FILE_NOT_FOUND")


class InvalidFileError(CorEngineError):
    """Raised when the input document is structurally invalid or unreadable."""

    def __init__(self, message: str = "Document file is invalid or corrupted"):
        super().__init__(message, error_code="INVALID_FILE")


class PdfProcessingError(CorEngineError):
    """Raised when PDF extraction or rendering fails."""

    def __init__(self, message: str = "PDF processing failed"):
        super().__init__(message, error_code="PDF_PROCESSING_ERROR")


class DocProcessingError(CorEngineError):
    """Raised when legacy DOC extraction or conversion fails."""

    def __init__(self, message: str = "DOC processing failed"):
        super().__init__(message, error_code="DOC_PROCESSING_ERROR")


class DocxProcessingError(CorEngineError):
    """Raised when DOCX parsing fails."""

    def __init__(self, message: str = "DOCX processing failed"):
        super().__init__(message, error_code="DOCX_PROCESSING_ERROR")


class OcrError(CorEngineError):
    """Raised when OCR detection or recognition fails."""

    def __init__(self, message: str = "OCR processing failed"):
        super().__init__(message, error_code="OCR_ERROR")


class OutputWriteError(CorEngineError):
    """Raised when writing the raw .txt artifact fails."""

    def __init__(self, message: str = "Failed to write extraction output file"):
        super().__init__(message, error_code="OUTPUT_WRITE_ERROR")


class EmptyExtractionError(CorEngineError):
    """Raised when no readable text or numbers could be extracted."""

    def __init__(self, message: str = "Document yielded zero extractable text"):
        super().__init__(message, error_code="EMPTY_EXTRACTION")


class ProcessingTimeoutError(CorEngineError):
    """Raised when processing exceeds allowable time limit."""

    def __init__(self, message: str = "Document processing timed out"):
        super().__init__(message, error_code="PROCESSING_TIMEOUT")


class SecurityError(CorEngineError):
    """Raised when a security boundary (path traversal, bomb) is violated."""

    def __init__(self, message: str = "Security boundary violation"):
        super().__init__(message, error_code="SECURITY_VIOLATION")


class DocConversionError(CorEngineError):
    """Raised when legacy DOC converter is missing or unavailable."""

    def __init__(self, message: str = "Legacy DOC conversion tool unavailable"):
        super().__init__(message, error_code="DOC_CONVERTER_UNAVAILABLE")


# Aliases for backwards compatibility
CorruptedDocumentError = InvalidFileError
OcrProcessingError = OcrError
