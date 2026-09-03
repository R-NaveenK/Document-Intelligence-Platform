import os
import pytest
from app.engine import ExtractionEngine
from app.word.word_handler import WordHandler
from app.models.extraction_result import ExtractionResult, ExtractionStatus

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_word_handler_processing():
    word_path = os.path.join(SAMPLE_DIR, "sample_invoice.docx")
    if not os.path.exists(word_path):
        pytest.skip("sample_invoice.docx missing.")

    pages = WordHandler.process_word(word_path)
    assert len(pages) == 1
    assert "TSPL/INV/2026-27/0990" in pages[0]["raw_text"]
    assert "Dell Latitude Laptop 5440" in pages[0]["raw_text"]

def test_engine_extract_word_document():
    word_path = os.path.join(SAMPLE_DIR, "sample_invoice.docx")
    if not os.path.exists(word_path):
        pytest.skip("sample_invoice.docx missing.")

    engine = ExtractionEngine()
    result = engine.extract(word_path, original_filename="sample_invoice.docx")

    assert isinstance(result, ExtractionResult)
    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type in ["docx", "doc"]
    assert "TECHSOLUTIONS PVT. LTD." in result.raw_text
    assert "Dell Latitude Laptop 5440" in result.raw_text
    assert "3,05,000.00" in result.raw_text
