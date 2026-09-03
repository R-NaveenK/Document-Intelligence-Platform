"""File router mapping detected document types to handlers."""
from pathlib import Path
from typing import Dict

from cor_engine.core.exceptions import UnsupportedFileTypeError
from cor_engine.core.result import RawExtraction
from cor_engine.handlers.base import BaseDocumentHandler
from cor_engine.handlers.doc_handler import DocHandler
from cor_engine.handlers.docx_handler import DocxHandler
from cor_engine.handlers.image_handler import ImageHandler
from cor_engine.handlers.pdf_handler import PdfHandler
from cor_engine.handlers.txt_handler import TxtHandler
from cor_engine.routing.file_detector import DocumentType, FileTypeDetector


class FileRouter:
    """Routes input documents to the appropriate extraction handler."""

    def __init__(self):
        self._handlers: Dict[DocumentType, BaseDocumentHandler] = {
            DocumentType.PDF: PdfHandler(),
            DocumentType.DOC: DocHandler(),
            DocumentType.DOCX: DocxHandler(),
            DocumentType.TXT: TxtHandler(),
            DocumentType.JPG: ImageHandler(),
            DocumentType.JPEG: ImageHandler(),
            DocumentType.PNG: ImageHandler(),
        }

    def route_and_extract(self, file_path: Path) -> tuple[RawExtraction, DocumentType]:
        """Detect file type and execute the registered document handler.

        Returns:
            tuple[RawExtraction, DocumentType]: Extracted raw pages and detected type.
        """
        doc_type = FileTypeDetector.detect(file_path)
        handler = self._handlers.get(doc_type)

        if not handler:
            raise UnsupportedFileTypeError(f"No handler registered for file type: {doc_type.value}")

        raw_extraction = handler.extract(file_path)
        return raw_extraction, doc_type
