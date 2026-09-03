from pathlib import Path
from typing import Union, Optional, Dict, Any, BinaryIO
from app.ocr.base import BaseExtractionEngine
from app.ocr.paddleocr_engine import PaddleOCREngine
from app.models.extraction_result import ExtractionResult, ExtractionStatus
from app.storage.raw_storage import (
    validate_document_id,
    generate_document_id,
    format_raw_text,
    persist_raw_extraction,
)


class ExtractionEngine:
    """
    Primary Python Programmatic Interface for Extraction Engine 1.
    Allows the larger Intelligent Document Processing Platform backend to invoke
    this extraction engine directly in-process without going over HTTP.
    Wraps the pluggable BaseExtractionEngine instance.
    """

    def __init__(self, engine_instance: Optional[BaseExtractionEngine] = None):
        """
        Initializes ExtractionEngine wrapper.
        Defaults to PaddleOCREngine if no specific implementation is provided.
        """
        self._engine: BaseExtractionEngine = engine_instance or PaddleOCREngine()

    def extract(
        self,
        document: Union[str, Path, bytes, BinaryIO],
        original_filename: Optional[str] = None,
        document_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> ExtractionResult:
        """
        Extracts raw unstructured text and metadata from input document.
        
        Args:
            document: Path to document file, raw byte stream, or file-like object.
            original_filename: Optional original document filename.
            document_id: Optional tracking identifier.
            options: Optional extraction runtime parameters.
            
        Returns:
            ExtractionResult object matching the standard extraction output contract.
        """
        result = self._engine.extract(
            document=document,
            original_filename=original_filename,
            document_id=document_id,
            options=options
        )
        if result.raw_file_path is None and result.status != ExtractionStatus.ERROR:
            try:
                doc_id = result.document_id
                if not doc_id:
                    doc_id = validate_document_id(document_id) if document_id else generate_document_id(original_filename)
                    result.document_id = doc_id
                raw_content = format_raw_text(result.pages, fallback_text=result.raw_text)
                raw_file_path, raw_file_id = persist_raw_extraction(
                    document_id=doc_id,
                    content=raw_content
                )
                result.raw_file_path = raw_file_path
                result.raw_file_id = raw_file_id
            except Exception as e:
                result.status = ExtractionStatus.ERROR
                result.errors.append(f"Persistence error: {str(e)}")
        return result

    def get_engine_id(self) -> str:
        """Returns engine identifier."""
        return self._engine.get_engine_id()

    def get_version(self) -> str:
        """Returns engine software version."""
        return self._engine.get_version()

    def health_check(self) -> Dict[str, Any]:
        """Returns health diagnostics."""
        return self._engine.health_check()
