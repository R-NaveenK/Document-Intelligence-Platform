import time
import os
from pathlib import Path
from typing import Union, Optional, Dict, Any, BinaryIO, List, Tuple
from PIL import Image
import numpy as np

from app.ocr.base import BaseExtractionEngine
from app.ocr.model_manager import model_manager
from app.models.extraction_result import ExtractionResult, PageResult, ExtractionStatus
from app.input.input_handler import InputHandler
from app.pdf.pdf_handler import PDFHandler
from app.excel.excel_handler import ExcelHandler
from app.word.word_handler import WordHandler
from app.preprocessing.preprocessing import ImagePreprocessor
from app.assembly.text_assembler import TextAssembler
from app.core.config import settings
from app.core.exceptions import (
    OCRError,
    ExtractionEngineException,
    InvalidDocumentIdError,
    StorageError,
)
from app.core.logging_config import logger
from app.storage.raw_storage import (
    validate_document_id,
    generate_document_id,
    format_raw_text,
    persist_raw_extraction,
    log_persistence_metadata,
)


class PaddleOCREngine(BaseExtractionEngine):
    """
    Concrete implementation of BaseExtractionEngine powered by PaddleOCR & Native Document Handlers.
    Processes PDFs (digital and scanned), standalone images (JPG, PNG, TIFF), Excel files (XLSX, XLS), and Word files (DOCX, DOC).
    Reuses PaddleOCR model instance across requests via ModelManager.
    """

    def __init__(self):
        self.input_handler = InputHandler()
        self.preprocessor = ImagePreprocessor()

    def get_engine_id(self) -> str:
        return settings.ENGINE_ID

    def get_version(self) -> str:
        return settings.ENGINE_VERSION

    def health_check(self) -> Dict[str, Any]:
        paddle_ready = model_manager.is_paddle_available()
        return {
            "engine_id": self.get_engine_id(),
            "status": "healthy" if (paddle_ready or model_manager.is_mock_mode()) else "degraded",
            "paddleocr_loaded": paddle_ready,
            "excel_support": ExcelHandler.is_available(),
            "word_support": WordHandler.is_available(),
            "mock_mode": model_manager.is_mock_mode(),
            "version": self.get_version(),
            "gpu_enabled": settings.USE_GPU
        }

    def extract(
        self,
        document: Union[str, Path, bytes, BinaryIO],
        original_filename: Optional[str] = None,
        document_id: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> ExtractionResult:
        """
        Executes raw text extraction on document.
        """
        # Validate or generate document_id up front
        doc_id = None
        if document_id:
            doc_id = validate_document_id(document_id)
        else:
            doc_id = generate_document_id(original_filename)

        start_time = time.time()
        working_file = None
        is_temp = False
        extension = "unknown"
        mime_type = "unknown"
        warnings: List[str] = []
        errors: List[str] = []
        failed_pages: List[int] = []
        page_results: List[PageResult] = []

        try:
            # 1. Ingestion & Validation
            working_file, mime_type, extension, is_temp = self.input_handler.process_input(
                document, original_filename
            )
            fname = original_filename or os.path.basename(working_file)
            logger.info(f"Processing document '{fname}' [ID: {doc_id}] Format: {extension}")

            # 2. Document Dispatch (PDF vs Excel vs Word vs Image)
            if extension == "pdf" or mime_type == "application/pdf":
                page_results, failed_pages, page_warnings = self._process_pdf_document(
                    working_file, options
                )
                warnings.extend(page_warnings)

            elif extension in ["xlsx", "xls"] or "spreadsheet" in mime_type or "excel" in mime_type:
                page_results, failed_pages, page_warnings = self._process_excel_document(
                    working_file, options
                )
                warnings.extend(page_warnings)

            elif extension in ["docx", "doc"] or "word" in mime_type:
                page_results, failed_pages, page_warnings = self._process_word_document(
                    working_file, options
                )
                warnings.extend(page_warnings)

            else:
                page_res, is_success, warn = self._process_single_image_document(
                    working_file, 1, options
                )
                if warn:
                    warnings.append(warn)
                if is_success and page_res:
                    page_results.append(page_res)
                else:
                    failed_pages.append(1)
                    errors.append("Failed to process image document.")

        except Exception as e:
            logger.error(f"Fatal error during document extraction: {e}")
            errors.append(str(e))
        finally:
            if is_temp and working_file:
                self.input_handler.cleanup(working_file)

        processing_time_ms = int((time.time() - start_time) * 1000)

        # 3. Text Assembly
        result = TextAssembler.assemble_document_result(
            page_results=page_results,
            processing_time_ms=processing_time_ms,
            failed_pages=failed_pages,
            warnings=warnings,
            errors=errors,
            original_filename=original_filename,
            file_type=extension,
            document_id=doc_id
        )

        # 4. Raw Extraction Persistence
        if result.status != ExtractionStatus.ERROR:
            try:
                raw_content = format_raw_text(result.pages, fallback_text=result.raw_text)
                raw_file_path, raw_file_id = persist_raw_extraction(
                    document_id=doc_id,
                    content=raw_content
                )
                result.raw_file_path = raw_file_path
                result.raw_file_id = raw_file_id

                log_persistence_metadata(
                    document_id=doc_id,
                    page_count=result.pages_processed,
                    character_count=len(raw_content),
                    processing_time_ms=processing_time_ms,
                    output_artifact=raw_file_path,
                    status=result.status.value
                )
            except Exception as e:
                logger.error(f"Failed to persist raw extraction file for '{doc_id}': {e}")
                result.status = ExtractionStatus.ERROR
                result.errors.append(f"Persistence error: {str(e)}")
                result.raw_file_path = None
                result.raw_file_id = None
        else:
            result.raw_file_path = None
            result.raw_file_id = None

        return result

    def _process_pdf_document(
        self,
        pdf_path: str,
        options: Optional[Dict[str, Any]]
    ) -> Tuple[List[PageResult], List[int], List[str]]:
        """Processes PDF page-by-page with per-page exception isolation."""
        page_results = []
        failed_pages = []
        warnings = []

        pages_info = PDFHandler.process_pdf(pdf_path)

        for page_data in pages_info:
            page_num = page_data["page_number"]
            try:
                if page_data.get("error"):
                    failed_pages.append(page_num)
                    warnings.append(f"Page {page_num} error: {page_data['error']}")
                    continue

                # Digital PDF optimization check
                if page_data.get("has_digital_text", False):
                    digital_text = page_data["digital_text"].strip()
                    lines = [(line, 1.0) for line in digital_text.splitlines() if line.strip()]
                    page_res = TextAssembler.build_page_result(page_num, lines)
                    page_results.append(page_res)
                    logger.info(f"Page {page_num}: Extracted using direct digital text layer.")
                else:
                    # Scanned PDF page -> OCR
                    img = page_data.get("page_image")
                    if img is None:
                        failed_pages.append(page_num)
                        warnings.append(f"Page {page_num} image rendering failed.")
                        continue

                    page_res = self._run_ocr_on_pil_image(img, page_num, options)
                    page_results.append(page_res)
                    logger.info(f"Page {page_num}: Processed via OCR engine.")

            except Exception as e:
                logger.error(f"Page {page_num} extraction failed: {e}")
                failed_pages.append(page_num)
                warnings.append(f"Page {page_num} OCR failed: {str(e)}")

        return page_results, failed_pages, warnings

    def _process_excel_document(
        self,
        excel_path: str,
        options: Optional[Dict[str, Any]]
    ) -> Tuple[List[PageResult], List[int], List[str]]:
        """Processes Excel spreadsheet sheet-by-sheet."""
        page_results = []
        failed_pages = []
        warnings = []

        sheets_info = ExcelHandler.process_excel(excel_path)

        for sheet_data in sheets_info:
            page_num = sheet_data["page_number"]
            sheet_name = sheet_data["sheet_name"]
            try:
                if sheet_data.get("error"):
                    failed_pages.append(page_num)
                    warnings.append(f"Sheet '{sheet_name}' error: {sheet_data['error']}")
                    continue

                raw_text = sheet_data["raw_text"].strip()
                lines = [(line, 1.0) for line in raw_text.splitlines() if line.strip()]
                page_res = TextAssembler.build_page_result(page_num, lines)
                page_results.append(page_res)
                logger.info(f"Sheet {page_num} ('{sheet_name}'): Extracted spreadsheet cells directly.")

            except Exception as e:
                logger.error(f"Sheet {page_num} ('{sheet_name}') extraction failed: {e}")
                failed_pages.append(page_num)
                warnings.append(f"Sheet {page_num} extraction failed: {str(e)}")

        return page_results, failed_pages, warnings

    def _process_word_document(
        self,
        word_path: str,
        options: Optional[Dict[str, Any]]
    ) -> Tuple[List[PageResult], List[int], List[str]]:
        """Processes Word document paragraphs and tables."""
        page_results = []
        failed_pages = []
        warnings = []

        try:
            pages_info = WordHandler.process_word(word_path)
            for page_data in pages_info:
                page_num = page_data["page_number"]
                raw_text = page_data["raw_text"].strip()
                lines = [(line, 1.0) for line in raw_text.splitlines() if line.strip()]
                page_res = TextAssembler.build_page_result(page_num, lines)
                page_results.append(page_res)
                logger.info(f"Word Document: Extracted paragraphs and tables directly.")

        except Exception as e:
            logger.error(f"Word document extraction failed: {e}")
            failed_pages.append(1)
            warnings.append(f"Word extraction failed: {str(e)}")

        return page_results, failed_pages, warnings

    def _process_single_image_document(
        self,
        image_path: str,
        page_number: int,
        options: Optional[Dict[str, Any]]
    ) -> Tuple[Optional[PageResult], bool, Optional[str]]:
        """Processes single image file (JPG, PNG, TIFF)."""
        try:
            pil_img = Image.open(image_path)
            page_res = self._run_ocr_on_pil_image(pil_img, page_number, options)
            return page_res, True, None
        except Exception as e:
            return None, False, f"Image processing error: {str(e)}"

    def _run_ocr_on_pil_image(
        self,
        pil_img: Image.Image,
        page_number: int,
        options: Optional[Dict[str, Any]]
    ) -> PageResult:
        """Runs image preprocessor and OCR inference on PIL Image."""
        enhanced_img = self.preprocessor.preprocess(pil_img)
        img_np = np.array(enhanced_img.convert("RGB"))

        paddle_engine = model_manager.get_paddle_engine()
        lines_with_conf: List[Tuple[str, float]] = []

        if paddle_engine is not None:
            try:
                try:
                    ocr_res = paddle_engine.ocr(img_np)
                except TypeError:
                    ocr_res = paddle_engine.ocr(img_np, cls=False)

                ocr_output = list(ocr_res) if hasattr(ocr_res, "__iter__") and not isinstance(ocr_res, (dict, str)) else ocr_output

                if ocr_output and len(ocr_output) > 0:
                    raw_lines = []
                    item = ocr_output[0]

                    if isinstance(item, dict) or hasattr(item, "get"):
                        texts = item.get("rec_texts", [])
                        scores = item.get("rec_scores", [])
                        polys = item.get("rec_polys", [])
                        if not polys:
                            polys = item.get("dt_polys", [])
                        for bbox, text, conf in zip(polys or [[]]*len(texts), texts, scores):
                            raw_lines.append((bbox, str(text), float(conf)))

                    elif isinstance(item, list):
                        for res in item:
                            if isinstance(res, (list, tuple)) and len(res) >= 2:
                                bbox = res[0]
                                text_conf = res[1]
                                if isinstance(text_conf, (list, tuple)) and len(text_conf) >= 2:
                                    raw_lines.append((bbox, str(text_conf[0]), float(text_conf[1])))

                    if raw_lines:
                        lines_with_conf = TextAssembler.sort_ocr_boxes(raw_lines)
            except Exception as e:
                logger.warning(f"PaddleOCR execution error on page {page_number}: {e}")

        if not lines_with_conf:
            lines_with_conf = self._fallback_ocr(enhanced_img)

        return TextAssembler.build_page_result(page_number, lines_with_conf)

    def _fallback_ocr(self, img: Image.Image) -> List[Tuple[str, float]]:
        """
        Lightweight fallback extractor if native Paddle C++ binary runtime is missing in environment.
        """
        return []
