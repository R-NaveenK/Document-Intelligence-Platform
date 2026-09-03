"""Result and data representation schemas for the COR extraction engine."""
from enum import Enum
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field, computed_field



class ExtractionStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"


class ErrorCode(str, Enum):
    UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    INVALID_FILE = "INVALID_FILE"
    CORRUPT_DOCUMENT = "CORRUPT_DOCUMENT"
    PDF_PROCESSING_ERROR = "PDF_PROCESSING_ERROR"
    DOC_PROCESSING_ERROR = "DOC_PROCESSING_ERROR"
    DOCX_PROCESSING_ERROR = "DOCX_PROCESSING_ERROR"
    OCR_ERROR = "OCR_ERROR"
    OUTPUT_WRITE_ERROR = "OUTPUT_WRITE_ERROR"
    EMPTY_EXTRACTION = "EMPTY_EXTRACTION"
    PROCESSING_TIMEOUT = "PROCESSING_TIMEOUT"
    SECURITY_VIOLATION = "SECURITY_VIOLATION"
    DOC_CONVERTER_UNAVAILABLE = "DOC_CONVERTER_UNAVAILABLE"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"


class PageExtraction(BaseModel):
    """Internal representation of a single extracted document page or logical section."""
    page_number: int = Field(..., description="1-indexed page or section number")
    text: str = Field(default="", description="Raw extracted text of this page")
    is_ocr: bool = Field(default=False, description="True if extracted via OCR, False if digital native")
    confidence: float = Field(default=1.0, description="Page extraction/OCR confidence score (0.0 - 1.0)")


class RawExtraction(BaseModel):
    """Internal representation of raw document extraction across all pages."""
    pages: List[PageExtraction] = Field(default_factory=list)
    has_page_numbers: bool = Field(default=False, description="True if document has native pages (PDF)")

    def to_unstructured_text(self) -> str:
        """Assemble all pages into one single unstructured textual representation.

        Preserves page boundaries cleanly for paginated documents (PDF).
        """
        if not self.pages:
            return ""

        if not self.has_page_numbers or (len(self.pages) == 1 and not self.pages[0].is_ocr and not self.has_page_numbers):
            # Unpaginated document (TXT, DOCX, Image)
            return "\n\n".join(p.text.strip() for p in self.pages if p.text.strip()).strip() + "\n"

        assembled = []
        for p in self.pages:
            header = f"----------------------------------------\nPAGE {p.page_number}\n----------------------------------------\n"
            assembled.append(f"{header}\n{p.text.strip()}")

        return "\n\n".join(assembled).strip() + "\n"

    @property
    def total_characters(self) -> int:
        return sum(len(p.text) for p in self.pages)

    @property
    def ocr_pages(self) -> int:
        return sum(1 for p in self.pages if p.is_ocr)

    @property
    def native_pages(self) -> int:
        return sum(1 for p in self.pages if not p.is_ocr)

    @property
    def aggregate_confidence(self) -> float:
        if not self.pages:
            return 1.0
        return round(sum(p.confidence for p in self.pages) / len(self.pages), 4)


class ExtractionResult(BaseModel):
    """Standardized extraction result returned by the COR engine.

    Conforms to the intelligent document processing common extraction contract.
    """
    engine_id: str = Field(default="COR", description="Unique identifier for this extraction engine")
    document_id: str = Field(..., description="Unique document identifier")
    status: ExtractionStatus = Field(..., description="Extraction outcome status: success or failed")
    raw_file_id: Optional[str] = Field(None, description="Filename of the saved .txt artifact")
    raw_file_path: Optional[str] = Field(None, description="Path to the saved .txt artifact")
    pages_processed: int = Field(default=0, description="Total number of document pages processed")
    characters_extracted: int = Field(default=0, description="Total characters extracted from the document")
    extraction_confidence: Optional[float] = Field(
        default=None,
        description="Average OCR/extraction confidence score (0.0 - 1.0)"
    )
    processing_time_ms: int = Field(default=0, description="Total extraction elapsed time in milliseconds")
    file_type: Optional[str] = Field(None, description="Detected input document type (PDF, DOCX, etc.)")
    input_filename: Optional[str] = Field(None, description="Original input document filename")
    ocr_pages: int = Field(default=0, description="Count of pages processed via PaddleOCR")
    native_pages: int = Field(default=0, description="Count of pages processed via native extraction")
    raw_text: Optional[str] = Field(
        default=None,
        description="Complete raw unstructured extracted text (retained internally for downstream contracts)"
    )
    error_code: Optional[str] = Field(default=None, description="Structured error code if extraction failed")
    error_message: Optional[str] = Field(default=None, description="Detailed error message if extraction failed")

    @computed_field  # type: ignore
    @property
    def page_count(self) -> int:
        """Alias for pages_processed."""
        return self.pages_processed

    @computed_field  # type: ignore
    @property
    def character_count(self) -> int:
        """Alias for characters_extracted."""
        return self.characters_extracted

    def to_common_contract(self) -> dict:
        """Serialize ExtractionResult into the standardized common extraction contract JSON structure."""
        rel_path = None
        if self.raw_file_path:
            try:
                rel_path = str(Path(self.raw_file_path).relative_to(Path.cwd())).replace("\\", "/")
            except ValueError:
                rel_path = str(self.raw_file_path).replace("\\", "/")

        contract = {
            "engine_id": self.engine_id,
            "status": self.status.value if isinstance(self.status, Enum) else str(self.status),
            "document_id": self.document_id,
            "input": {
                "filename": self.input_filename or "",
                "file_type": (self.file_type or "").lower(),
            },
            "metrics": {
                "pages_processed": self.pages_processed,
                "characters_extracted": self.characters_extracted,
                "processing_time_ms": self.processing_time_ms,
            },
            "confidence": {
                "extraction_confidence": self.extraction_confidence if self.extraction_confidence is not None else 1.0
            }
        }

        if self.status == ExtractionStatus.SUCCESS or str(self.status) == "success":
            contract["artifact"] = {
                "type": "text/plain",
                "file_id": self.raw_file_id or f"{self.document_id}.txt",
                "path": rel_path or f"data/cor_extractions/{self.document_id}.txt",
            }
        else:
            contract["error"] = {
                "code": self.error_code or "EXTRACTION_FAILED",
                "message": self.error_message or "Extraction failed",
            }

        return contract

