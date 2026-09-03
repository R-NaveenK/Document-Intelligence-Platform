"""PDF Document Handler supporting digital native text, scanned page OCR, and mixed multi-page PDFs."""
import gc
import logging
from pathlib import Path
from typing import List, Tuple

import pymupdf as fitz

from cor_engine.core.config import (
    COR_PDF_MAX_GARBAGE_RATIO,
    COR_PDF_MIN_ALPHANUMERIC_RATIO,
    COR_PDF_MIN_TEXT_CHARS,
    COR_PDF_RENDER_DPI,
)
from cor_engine.core.exceptions import PdfProcessingError
from cor_engine.core.result import PageExtraction, RawExtraction
from cor_engine.handlers.base import BaseDocumentHandler
from cor_engine.ocr.paddle_engine import PaddleOCREngine

logger = logging.getLogger("cor_engine.handlers.pdf")


def is_high_quality_native_text(text: str) -> bool:
    """Evaluate whether native PDF extracted text is useful or whether page is a scan.

    Evaluates:
    - Minimum non-whitespace character count (COR_PDF_MIN_TEXT_CHARS).
    - Ratio of printable characters.
    - Ratio of replacement / unmapped unicode characters ('\ufffd').
    - Ratio of meaningful alphanumeric characters (COR_PDF_MIN_ALPHANUMERIC_RATIO).
    - Presence of real word tokens (at least two words with >= 2 alphanumeric characters).
    """
    stripped = text.strip()
    total_len = len(stripped)
    if total_len < COR_PDF_MIN_TEXT_CHARS:
        return False

    # Check unmapped / replacement characters
    garbage_count = stripped.count("\ufffd")
    if (garbage_count / total_len) > COR_PDF_MAX_GARBAGE_RATIO:
        return False

    # Printable character check
    printable_count = sum(1 for c in stripped if c.isprintable() or c in ("\n", "\r", "\t"))
    if (printable_count / total_len) < 0.85:
        return False

    # Alphanumeric ratio check
    alnum_count = sum(1 for c in stripped if c.isalnum())
    if (alnum_count / total_len) < COR_PDF_MIN_ALPHANUMERIC_RATIO:
        return False

    # Verify at least two readable word tokens
    words = [w for w in stripped.split() if sum(1 for c in w if c.isalnum()) >= 2]
    if len(words) < 2:
        return False

    return True


class PdfHandler(BaseDocumentHandler):
    """Hybrid PDF Handler with page-by-page streaming, heuristic quality evaluation, and OCR fallback."""

    def __init__(self, render_dpi: int = COR_PDF_RENDER_DPI, min_text_chars: int = COR_PDF_MIN_TEXT_CHARS):
        self.render_dpi = render_dpi
        self.min_text_chars = min_text_chars
        self._ocr_engine = PaddleOCREngine.get_instance()

    def process(self, file_path: Path) -> RawExtraction:
        """Process PDF document page-by-page.

        Memory safe: releases pixmaps immediately and runs garbage collection per page.
        """
        try:
            doc = fitz.open(str(file_path))
        except Exception as exc:
            logger.error("[COR] Failed to open PDF '%s': %s", file_path.name, exc)
            raise PdfProcessingError(f"Failed to open PDF file: {str(exc)}") from exc

        pages: List[PageExtraction] = []
        try:
            total_pages = len(doc)
            logger.info("[COR] Processing PDF '%s' (%d pages)", file_path.name, total_pages)

            for page_idx in range(total_pages):
                page_num = page_idx + 1
                page = doc.load_page(page_idx)

                # 1. Attempt native text extraction
                native_text = page.get_text("text")

                if is_high_quality_native_text(native_text):
                    logger.debug("[COR] PDF page %d: native text accepted (%d chars)", page_num, len(native_text.strip()))
                    pages.append(
                        PageExtraction(
                            page_number=page_num,
                            text=native_text.strip(),
                            is_ocr=False,
                            confidence=1.0,
                        )
                    )
                else:
                    # 2. Scanned or insufficient text: render page at configured DPI and execute OCR
                    logger.debug("[COR] PDF page %d: insufficient native text, rendering at %d DPI for OCR", page_num, self.render_dpi)
                    ocr_text, confidence = self._ocr_page(page)
                    pages.append(
                        PageExtraction(
                            page_number=page_num,
                            text=ocr_text,
                            is_ocr=True,
                            confidence=confidence,
                        )
                    )

                # Explicitly release memory after each page to handle large multi-page PDFs
                del page
                gc.collect()

        except PdfProcessingError:
            raise
        except Exception as exc:
            logger.error("[COR] Error processing PDF pages: %s", exc)
            raise PdfProcessingError(f"PDF extraction failed: {str(exc)}") from exc
        finally:
            doc.close()

        return RawExtraction(pages=pages, has_page_numbers=True)

    def extract(self, file_path: Path) -> RawExtraction:
        """Extract method conforming to BaseDocumentHandler."""
        return self.process(file_path)

    def _ocr_page(self, page: fitz.Page) -> Tuple[str, float]:
        """Render a single PDF page to an image and run PaddleOCR."""
        try:
            zoom = self.render_dpi / 72.0
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img_bytes = pix.tobytes("png")
            del pix  # Release pixmap buffer immediately

            text, confidence = self._ocr_engine.process_image(img_bytes, apply_preprocessing=True)
            return text, confidence
        except Exception as exc:
            logger.error("[COR] Page OCR failed: %s", exc)
            raise PdfProcessingError(f"PDF page rendering/OCR failed: {str(exc)}") from exc
