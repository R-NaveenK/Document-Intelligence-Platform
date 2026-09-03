"""
Structured exception hierarchy for Extraction Engine 1.
"""

class ExtractionEngineException(Exception):
    """Base exception for all extraction engine errors."""
    def __init__(self, message: str, code: str = "EXTRACTION_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class InvalidInputError(ExtractionEngineException):
    """Raised when uploaded file is missing, empty, or fails validation."""
    def __init__(self, message: str):
        super().__init__(message, code="INVALID_INPUT")


class UnsupportedFileError(ExtractionEngineException):
    """Raised when document file format/MIME type is not supported."""
    def __init__(self, message: str):
        super().__init__(message, code="UNSUPPORTED_FORMAT")


class CorruptedFileError(ExtractionEngineException):
    """Raised when document is corrupted and cannot be parsed."""
    def __init__(self, message: str):
        super().__init__(message, code="CORRUPTED_FILE")


class PreprocessingError(ExtractionEngineException):
    """Raised when image preprocessing fails."""
    def __init__(self, message: str):
        super().__init__(message, code="PREPROCESSING_FAILURE")


class OCRError(ExtractionEngineException):
    """Raised when OCR engine initialization or inference fails."""
    def __init__(self, message: str):
        super().__init__(message, code="OCR_FAILURE")


class InvalidDocumentIdError(InvalidInputError):
    """Raised when document ID contains invalid characters or path traversal elements."""
    def __init__(self, message: str):
        super().__init__(message)
        self.code = "INVALID_DOCUMENT_ID"


class StorageError(ExtractionEngineException):
    """Raised when raw artifact persistence or filesystem operations fail."""
    def __init__(self, message: str):
        super().__init__(message, code="STORAGE_ERROR")
