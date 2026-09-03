"""Image document handler (JPG, JPEG, PNG) using PaddleOCR."""
from pathlib import Path

from cor_engine.core.result import PageExtraction, RawExtraction
from cor_engine.handlers.base import BaseDocumentHandler
from cor_engine.ocr.paddle_engine import PaddleOCREngine


class ImageHandler(BaseDocumentHandler):
    """Handler for image documents: JPG, JPEG, and PNG."""

    def __init__(self):
        self.ocr_engine = PaddleOCREngine.get_instance()

    def extract(self, file_path: Path) -> RawExtraction:
        """Extract text from an image using PaddleOCR."""
        raw_text, confidence = self.ocr_engine.process_image(file_path, preprocess=True)
        page = PageExtraction(
            page_number=1,
            text=raw_text,
            is_ocr=True,
            confidence=confidence
        )
        return RawExtraction(pages=[page])
