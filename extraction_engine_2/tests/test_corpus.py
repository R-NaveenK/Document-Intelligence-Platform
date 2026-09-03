"""Comprehensive test suite for the Section 33 & 34 test corpus."""
import json
from pathlib import Path
import pytest

from cor_engine import CORExtractionEngine
from cor_engine.core.result import ExtractionStatus


CORPUS_DIR = Path("./test_corpus")


@pytest.fixture(scope="module")
def corpus_output_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("corpus_outputs")


@pytest.fixture(scope="module")
def engine(corpus_output_dir):
    return CORExtractionEngine(output_dir=corpus_output_dir)


def verify_extraction_criteria(result, expected_type: str):
    # 1. File accepted
    assert result.status == ExtractionStatus.SUCCESS
    # 2. Correct handler selected
    assert result.file_type == expected_type
    # 3. Text extracted
    assert result.characters_extracted > 30
    assert result.raw_text is not None and len(result.raw_text.strip()) > 0
    # 6. Raw text written to .txt
    assert result.raw_file_path is not None
    out_file = Path(result.raw_file_path)
    assert out_file.exists()
    # 7. Output file is UTF-8
    content = out_file.read_text(encoding="utf-8")
    assert len(content) > 0
    # 9. No semantic structuring occurs: must NOT be JSON
    is_json = False
    try:
        json.loads(content)
        is_json = True
    except Exception:
        is_json = False
    assert not is_json, "Extraction output must remain unstructured text!"
    # 9. No field mapping: verify field names were not converted
    assert "invoice_number:" not in content.lower()
    assert "total_amount:" not in content.lower()


def test_01_txt_document(engine):
    p = CORPUS_DIR / "01_invoice.txt"
    res = engine.extract(p, document_id="corpus_01_txt")
    verify_extraction_criteria(res, "TXT")
    # Section 35 check: preserve verbatim
    assert "INV-2026-0098" in res.raw_text
    assert "ABC INDUSTRIES LTD" in res.raw_text
    assert "Rs. 48,500" in res.raw_text


def test_02_docx_document(engine):
    p = CORPUS_DIR / "02_contract.docx"
    res = engine.extract(p, document_id="corpus_02_docx")
    verify_extraction_criteria(res, "DOCX")
    assert "INV-2026-0098" in res.raw_text
    assert "Dell Latitude" in res.raw_text


def test_03_selectable_pdf(engine):
    p = CORPUS_DIR / "03_selectable_text.pdf"
    res = engine.extract(p, document_id="corpus_03_pdf_text")
    verify_extraction_criteria(res, "PDF")
    assert "PAGE 1" in res.raw_text
    assert "INV-2026-0098" in res.raw_text
    assert "Rs. 48,500" in res.raw_text


def test_04_scanned_pdf(engine):
    p = CORPUS_DIR / "04_scanned_receipt.pdf"
    res = engine.extract(p, document_id="corpus_04_scanned_pdf")
    verify_extraction_criteria(res, "PDF")
    assert "PAGE 1" in res.raw_text
    assert "INV-2026-0098" in res.raw_text or "INVOICE" in res.raw_text


def test_05_png_invoice(engine):
    p = CORPUS_DIR / "05_tax_invoice.png"
    res = engine.extract(p, document_id="corpus_05_png")
    verify_extraction_criteria(res, "PNG")
    assert res.extraction_confidence is not None


def test_06_jpg_document(engine):
    p = CORPUS_DIR / "06_purchase_order.jpg"
    res = engine.extract(p, document_id="corpus_06_jpg")
    verify_extraction_criteria(res, "JPG")
    assert res.extraction_confidence is not None


def test_07_jpeg_statement(engine):
    p = CORPUS_DIR / "07_statement.jpeg"
    res = engine.extract(p, document_id="corpus_07_jpeg")
    verify_extraction_criteria(res, "JPEG")
    assert res.extraction_confidence is not None


def test_08_multipage_pdf(engine):
    p = CORPUS_DIR / "08_multipage_report.pdf"
    res = engine.extract(p, document_id="corpus_08_multipage")
    verify_extraction_criteria(res, "PDF")
    assert res.pages_processed == 2
    # 8. Page boundaries preserved
    assert "PAGE 1" in res.raw_text
    assert "PAGE 2" in res.raw_text
    assert "ANNUAL OPERATIONS REPORT" in res.raw_text
    assert "FINANCIAL SUMMARY" in res.raw_text
