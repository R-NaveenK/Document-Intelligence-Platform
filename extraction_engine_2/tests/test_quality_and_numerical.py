"""Extraction quality and numerical preservation tests."""
import json
from pathlib import Path
import pytest
from PIL import Image, ImageDraw
import fitz
from cor_engine.extractor import CorExtractor
from cor_engine.models import ExtractionStatus


def test_numerical_preservation_and_quality(tmp_path, test_output_dir):
    """Verify exact numerical and identifier preservation on a realistic invoice."""
    pdf_path = tmp_path / "realistic_invoice.pdf"

    # Create document with realistic invoice data
    doc = fitz.open()
    page = doc.new_page()

    lines = [
        "TAX INVOICE",
        "Invoice No: INV-2026-0098",
        "Bill To: ABC INDUSTRIES LTD",
        "GSTIN: 29AAACB1234C1Z6",
        "PAN: AAACB1234C",
        "HSN/SAC: 998313",
        "Quantity: 25",
        "Unit Price: 1940.00",
        "Tax Rate: 18%",
        "CGST: Rs. 4,365",
        "SGST: Rs. 4,365",
        "Grand Total: Rs. 48,500",
        "Bank A/C: 987654321012",
        "IFSC: HDFC0001234",
    ]

    y = 50
    for line in lines:
        page.insert_text((40, y), line, fontsize=12)
        y += 24

    doc.save(pdf_path)
    doc.close()

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(pdf_path, document_id="quality_test")

    assert result.status == ExtractionStatus.SUCCESS
    out_file = Path(result.raw_file_path)
    raw_text = out_file.read_text(encoding="utf-8")

    # 1. Verify critical content survived extraction
    assert "INV-2026-0098" in raw_text
    assert "ABC INDUSTRIES LTD" in raw_text
    assert "29AAACB1234C1Z6" in raw_text
    assert "AAACB1234C" in raw_text
    assert "998313" in raw_text
    assert "48,500" in raw_text
    assert "987654321012" in raw_text
    assert "HDFC0001234" in raw_text

    # 2. Verify output remains UNSTRUCTURED:
    # It must NOT be converted to JSON or a key-value dictionary
    assert not raw_text.strip().startswith("{")
    assert not raw_text.strip().endswith("}")
    with pytest.raises(Exception):
        # Should not be valid JSON
        json.loads(raw_text)

    # 3. Verify it did NOT semantically rename fields
    assert "invoice_number" not in raw_text.lower()
    assert "customer_name" not in raw_text.lower()
    assert "total_amount" not in raw_text.lower()
