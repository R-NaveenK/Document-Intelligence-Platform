import os
import pytest
from app.engine import ExtractionEngine
from app.models.extraction_result import ExtractionResult, ExtractionStatus

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_engine_initialization_and_metadata():
    engine = ExtractionEngine()
    assert engine.get_engine_id() == "engine_1"
    assert engine.get_version() == "1.0.0"
    health = engine.health_check()
    assert health["engine_id"] == "engine_1"

def test_engine_extract_digital_pdf():
    pdf_path = os.path.join(SAMPLE_DIR, "digital_invoice_1.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Digital PDF sample document missing.")

    engine = ExtractionEngine()
    result = engine.extract(pdf_path, original_filename="digital_invoice_1.pdf")

    assert isinstance(result, ExtractionResult)
    assert result.status == ExtractionStatus.SUCCESS
    assert "ABC TECHNOLOGIES" in result.raw_text
    assert "INV-10245" in result.raw_text
    assert result.pages_processed == 1

def test_engine_extract_png_image():
    png_path = os.path.join(SAMPLE_DIR, "receipt_sample.png")
    if not os.path.exists(png_path):
        pytest.skip("PNG sample document missing.")

    engine = ExtractionEngine()
    result = engine.extract(png_path, original_filename="receipt_sample.png")

    assert isinstance(result, ExtractionResult)
    assert result.pages_processed == 1
