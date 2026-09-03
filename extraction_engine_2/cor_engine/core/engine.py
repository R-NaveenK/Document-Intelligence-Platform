"""Core COR Document Extraction Engine implementation."""
import logging
from pathlib import Path
import time
from typing import Optional, Union

from cor_engine.core.config import COR_OUTPUT_DIR, MAX_FILE_SIZE_BYTES
from cor_engine.core.exceptions import CorEngineError, MissingFileError, SecurityError
from cor_engine.core.result import ExtractionResult, ExtractionStatus
from cor_engine.output.raw_writer import RawTextWriter
from cor_engine.routing.file_router import FileRouter

logger = logging.getLogger("cor_engine")


class CORExtractionEngine:
    """COR Independent Document Extraction Engine.

    Architecture & Responsibility:
        INPUT FILE
            ↓
        FILE TYPE DETECTION
            ↓
        APPROPRIATE EXTRACTION METHOD
            ↓
        RAW TEXT EXTRACTION
            ↓
        RAW UNSTRUCTURED TEXT
            ↓
        SAVE AS .TXT (Atomic Write)
            ↓
        RETURN EXTRACTION RESULT
    """

    def __init__(self, output_dir: Optional[Union[str, Path]] = None):
        self.output_dir = Path(output_dir).resolve() if output_dir else COR_OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.router = FileRouter()
        self.writer = RawTextWriter(output_dir=self.output_dir)

    def extract(
        self,
        input_file: Union[str, Path],
        document_id: Optional[str] = None,
        save_artifact: bool = True
    ) -> ExtractionResult:
        """Extract all readable unstructured textual and numerical content from input_file.

        Args:
            input_file: Path or string reference to input document.
            document_id: Optional unique document identifier (sanitized if provided).
            save_artifact: Whether to write the .txt artifact to disk (default True).

        Returns:
            ExtractionResult: Standardized metadata conforming to intelligent document processing contract.
        """
        start_time = time.perf_counter()
        doc_id = "unknown"
        input_path = Path(input_file).resolve()

        try:
            # 1. Validate file existence and size limits
            if not input_path.is_file():
                raise MissingFileError(f"Input file not found: {input_path}")

            file_size = input_path.stat().st_size
            if file_size > MAX_FILE_SIZE_BYTES:
                raise SecurityError(f"File size exceeds limit ({file_size} > {MAX_FILE_SIZE_BYTES} bytes)")

            # 2. Resolve safe document identifier
            doc_id = self.writer.generate_safe_doc_id(document_id, source_path=input_path)

            # 3. Route to handler and extract raw pages
            raw_extraction, doc_type = self.router.route_and_extract(input_path)

            # 4. Assemble into raw unstructured text
            raw_text = raw_extraction.to_unstructured_text()
            char_count = len(raw_text)
            page_count = len(raw_extraction.pages)

            # 5. Persist raw text artifact atomically
            raw_file_id: Optional[str] = None
            raw_file_path: Optional[str] = None

            if save_artifact:
                raw_file_id, raw_file_path = self.writer.write_artifact(
                    document_id=doc_id,
                    text=raw_text,
                    encoding="utf-8"
                )

            elapsed_ms = int((time.perf_counter() - start_time) * 1000)

            # 6. Metadata-only logging (NO document content)
            logger.info(
                "[COR] document_id=%s file_type=%s pages=%d ocr_pages=%d native_pages=%d "
                "characters=%d processing_time_ms=%d status=success",
                doc_id, doc_type.value, page_count, raw_extraction.ocr_pages,
                raw_extraction.native_pages, char_count, elapsed_ms
            )

            return ExtractionResult(
                engine_id="COR",
                document_id=doc_id,
                status=ExtractionStatus.SUCCESS,
                raw_file_id=raw_file_id,
                raw_file_path=raw_file_path,
                pages_processed=page_count,
                characters_extracted=char_count,
                extraction_confidence=raw_extraction.aggregate_confidence,
                processing_time_ms=elapsed_ms,
                file_type=doc_type.value,
                input_filename=input_path.name,
                ocr_pages=raw_extraction.ocr_pages,
                native_pages=raw_extraction.native_pages,
                raw_text=raw_text,
            )

        except CorEngineError as c_err:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            logger.error(
                "[COR] document_id=%s status=failed error_code=%s message=%s",
                doc_id, c_err.error_code, c_err.message
            )
            return ExtractionResult(
                engine_id="COR",
                document_id=doc_id,
                status=ExtractionStatus.FAILED,
                error_code=c_err.error_code,
                error_message=c_err.message,
                processing_time_ms=elapsed_ms,
                input_filename=input_path.name if input_path.exists() else None,
            )
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            logger.error("[COR] document_id=%s status=failed unexpected_error=%s", doc_id, str(exc), exc_info=True)
            return ExtractionResult(
                engine_id="COR",
                document_id=doc_id,
                status=ExtractionStatus.FAILED,
                error_code="EXTRACTION_FAILED",
                error_message=f"Extraction failed for document: {input_path.name}",
                processing_time_ms=elapsed_ms,
                input_filename=input_path.name if input_path.exists() else None,
            )

    def health_check(self) -> dict:
        """Return operational health status of the COR engine and OCR sub-components."""
        ocr_available = False
        try:
            from cor_engine.ocr.paddle_engine import PaddleOCREngine
            ocr_engine = PaddleOCREngine.get_instance()
            ocr_engine._ensure_initialized()
            ocr_available = (ocr_engine._ocr is not None)
        except Exception as exc:
            logger.warning("[COR] Health check OCR initialization check failed: %s", exc)
            ocr_available = False

        return {
            "engine": "COR",
            "status": "healthy" if ocr_available else "degraded",
            "ocr_available": ocr_available,
        }

    def get_capabilities(self) -> dict:
        """Expose engine capabilities and supported document formats."""
        return {
            "engine_id": "COR",
            "supported_formats": ["pdf", "doc", "docx", "txt", "jpg", "jpeg", "png"],
            "ocr_engine": "PaddleOCR",
            "native_extraction": ["pdf", "docx", "txt", "doc"],
            "artifact_format": "text/plain",
        }



# Default singleton instance and convenience functions
_default_engine: Optional[CORExtractionEngine] = None


def extract(
    input_file: Union[str, Path],
    document_id: Optional[str] = None,
    output_dir: Optional[Union[str, Path]] = None,
    save_artifact: bool = True
) -> ExtractionResult:
    """Convenience functional interface for document extraction."""
    global _default_engine
    if output_dir:
        engine = CORExtractionEngine(output_dir=output_dir)
    else:
        if _default_engine is None:
            _default_engine = CORExtractionEngine()
        engine = _default_engine

    return engine.extract(input_file=input_file, document_id=document_id, save_artifact=save_artifact)


# Backwards compatibility alias
CorExtractor = CORExtractionEngine
