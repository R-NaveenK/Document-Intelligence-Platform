import os
from typing import List, Dict, Any, Tuple, Optional
from PIL import Image
import io

try:
    import pymupdf as fitz
    PYMUPDF_AVAILABLE = True
except ImportError:
    try:
        import fitz
        PYMUPDF_AVAILABLE = True
    except ImportError:
        PYMUPDF_AVAILABLE = False

from app.core.exceptions import CorruptedFileError, ExtractionEngineException
from app.core.logging_config import logger


class PDFHandler:
    """
    Handles PDF document inspection, text layer evaluation, page rendering to images,
    and multi-page handling using PyMuPDF (pymupdf).
    """

    @staticmethod
    def is_available() -> bool:
        return PYMUPDF_AVAILABLE

    @staticmethod
    def get_page_count(pdf_path: str) -> int:
        """Returns total page count of PDF document."""
        if not PYMUPDF_AVAILABLE:
            raise ExtractionEngineException("PyMuPDF (pymupdf) is not installed.")
        try:
            doc = fitz.open(pdf_path)
            count = len(doc)
            doc.close()
            return count
        except Exception as e:
            raise CorruptedFileError(f"Failed to open PDF document: {str(e)}")

    @staticmethod
    def process_pdf(
        pdf_path: str,
        dpi: int = 300,
        min_digital_char_count: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Processes a multi-page PDF document.
        For each page, determines whether digital text layer is usable or if OCR image rendering is required.
        """
        if not PYMUPDF_AVAILABLE:
            raise ExtractionEngineException("PyMuPDF (pymupdf) is not installed.")

        pages_data = []
        try:
            doc = fitz.open(pdf_path)
        except Exception as e:
            raise CorruptedFileError(f"Corrupted or invalid PDF file: {str(e)}")

        if len(doc) == 0:
            doc.close()
            raise CorruptedFileError("PDF file contains 0 pages.")

        for i, page in enumerate(doc):
            page_num = i + 1
            try:
                digital_text = page.get_text("text") or ""
                cleaned_text = digital_text.strip()
                
                # Digital text layer usability check
                has_usable_digital = len(cleaned_text) >= min_digital_char_count

                # Render page image
                pix = page.get_pixmap(dpi=dpi)
                img = Image.open(io.BytesIO(pix.tobytes("png")))

                pages_data.append({
                    "page_number": page_num,
                    "has_digital_text": has_usable_digital,
                    "digital_text": digital_text,
                    "page_image": img,
                })
            except Exception as e:
                logger.error(f"Error processing page {page_num} of PDF {pdf_path}: {e}")
                pages_data.append({
                    "page_number": page_num,
                    "has_digital_text": False,
                    "digital_text": "",
                    "page_image": None,
                    "error": str(e)
                })

        doc.close()
        return pages_data
