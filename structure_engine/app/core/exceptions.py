from typing import Optional, Dict, Any

class StructuringEngineException(Exception):
    """Base exception for all structuring layer failures."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

class InvalidInputError(StructuringEngineException):
    """Raised when request payload or raw extraction input is invalid or empty."""
    pass

class RequestParsingError(StructuringEngineException):
    """Raised when user natural language request cannot be parsed into fields."""
    pass

class SchemaGenerationError(StructuringEngineException):
    """Raised when dynamic Pydantic model compilation fails."""
    pass

class CandidateFinderError(StructuringEngineException):
    """Raised when candidate search fails critically."""
    pass

class FieldExtractionError(StructuringEngineException):
    """Raised when field value extraction encounters unexpected failures."""
    pass

class OutputGenerationError(StructuringEngineException):
    """Raised when structured output generator fails to produce schema-conforming payload."""
    pass

class RawArtifactNotFoundError(StructuringEngineException):
    """Raised when raw extraction file cannot be found on disk."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.error_code = "RAW_ARTIFACT_NOT_FOUND"

class RawArtifactReadError(StructuringEngineException):
    """Raised when raw extraction file cannot be read due to I/O or encoding errors."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.error_code = "RAW_ARTIFACT_READ_ERROR"

class EmptyRawArtifactError(StructuringEngineException):
    """Raised when raw extraction artifact contains zero content."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.error_code = "EMPTY_RAW_ARTIFACT_ERROR"

class OversizedDocumentError(StructuringEngineException):
    """Raised when raw extraction document exceeds maximum permissible size."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.error_code = "OVERSIZED_DOCUMENT_ERROR"

class SecurityPathTraversalError(StructuringEngineException):
    """Raised when document_id or artifact path attempts path traversal or unauthorized directory access."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.error_code = "SECURITY_PATH_TRAVERSAL_ERROR"

class InvalidDocumentIdError(StructuringEngineException):
    """Raised when document_id format is invalid or contains forbidden characters."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, details)
        self.error_code = "INVALID_DOCUMENT_ID"
