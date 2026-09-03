"""Document handlers package."""
from cor_engine.handlers.base import BaseDocumentHandler
from cor_engine.handlers.image_handler import ImageHandler
from cor_engine.handlers.pdf_handler import PdfHandler
from cor_engine.handlers.docx_handler import DocxHandler
from cor_engine.handlers.doc_handler import DocHandler
from cor_engine.handlers.txt_handler import TxtHandler

__all__ = [
    "BaseDocumentHandler",
    "ImageHandler",
    "PdfHandler",
    "DocxHandler",
    "DocHandler",
    "TxtHandler",
]
