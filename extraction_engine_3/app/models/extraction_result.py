from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ExtractionStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    ERROR = "error"


class PageResult(BaseModel):
    """Result payload for an individual page."""
    page_number: int = Field(..., description="1-indexed page number")
    raw_text: str = Field("", description="Raw unstructured text extracted from this page")
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="OCR / text recognition confidence score (0.0 - 1.0)")
    character_count: int = Field(0, description="Total characters extracted from this page")
    word_count: int = Field(0, description="Total words extracted from this page")


class ExtractionResult(BaseModel):
    """
    Standard output contract for Extraction Engines.
    Consumed directly by downstream Comparison Engine.
    """
    engine_id: str = Field("engine_1", description="Identifier of the extraction engine")
    status: ExtractionStatus = Field(ExtractionStatus.SUCCESS, description="Execution status")
    raw_text: str = Field("", description="Complete combined raw text extracted from document")
    pages: List[PageResult] = Field(default_factory=list, description="Per-page raw text extraction results")
    extraction_confidence: float = Field(0.0, ge=0.0, le=1.0, description="Aggregated extraction confidence score")
    pages_processed: int = Field(0, ge=0, description="Total number of successfully processed pages")
    failed_pages: List[int] = Field(default_factory=list, description="Page numbers that failed extraction")
    processing_time_ms: int = Field(0, ge=0, description="Total processing time in milliseconds")
    
    # Metadata & Diagnostics
    original_filename: Optional[str] = Field(None, description="Original uploaded document filename")
    file_type: Optional[str] = Field(None, description="Detected document MIME type or extension")
    engine_version: str = Field("1.0.0", description="Engine software version")
    warnings: List[str] = Field(default_factory=list, description="Non-fatal execution warnings")
    errors: List[str] = Field(default_factory=list, description="Fatal or partial execution error messages")
    document_id: Optional[str] = Field(None, description="Document tracking ID (generated or provided by caller)")
    raw_file_path: Optional[str] = Field(None, description="Path to persisted raw extraction text file")
    raw_file_id: Optional[str] = Field(None, description="Filename/identifier of persisted raw extraction text file")
