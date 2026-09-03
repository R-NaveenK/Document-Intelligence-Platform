import os
import pytest
from app.engine import ExtractionEngine

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_numerical_content_preservation():
    pdf_path = os.path.join(SAMPLE_DIR, "numeric_financials.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("numeric_financials.pdf missing.")

    engine = ExtractionEngine()
    result = engine.extract(pdf_path, original_filename="numeric_financials.pdf")

    assert result.status.value == "success"
    text = result.raw_text

    # Verify exact numeric strings are preserved without normalization
    assert "INV-10245" in text
    assert "1O245" in text
    assert "10245" in text
    assert "+91 9876543210" in text
    assert "12.5%" in text
    assert "82,500.50" in text
    assert "$1,250.99" in text
