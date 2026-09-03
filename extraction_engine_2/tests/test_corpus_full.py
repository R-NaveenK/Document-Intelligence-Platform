"""Full test matrix for Section 33 & Section 34 of the COR extraction engine."""
import json
from pathlib import Path
import pytest

from cor_engine import CORExtractionEngine
from cor_engine.core.result import ExtractionStatus

CORPUS_DIR = Path("./test_corpus")


@pytest.fixture(scope="module")
def engine(tmp_path_factory):
    out = tmp_path_factory.mktemp("full_matrix_outputs")
    return CORExtractionEngine(output_dir=out)


def _assert_unstructured_contract(result, expected_file_type: str):
    """Verify common extraction criteria:
    - Status is success
    - File type matches expected
    - Raw text exists
    - Saved as .txt in UTF-8
    - Output is strictly UNSTRUCTURED (not JSON, no schema conversion)
    """
    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type == expected_file_type
    assert result.characters_extracted > 20
    assert result.raw_file_path is not None

    out_p = Path(result.raw_file_path)
    assert out_p.exists()
    content = out_p.read_text(encoding="utf-8")
    assert len(content.strip()) > 0

    # Ensure NOT JSON
    try:
        json.loads(content)
        assert False, "Output must NOT be JSON"
    except Exception:
        pass

    # Ensure no semantic schema mapping
    assert "invoice_number:" not in content.lower()
    assert "customer_name:" not in content.lower()
    assert "total_amount:" not in content.lower()


# 1. PDF text-based
def test_matrix_pdf_text_based(engine):
    p = CORPUS_DIR / "A_invoice_digital.pdf"
    res = engine.extract(p, document_id="matrix_pdf_text")
    _assert_unstructured_contract(res, "PDF")
    assert "PAGE 1" in res.raw_text
    assert "INV-2026-0098" in res.raw_text
    assert "Rs. 48,500" in res.raw_text


# 2. PDF scanned
def test_matrix_pdf_scanned(engine):
    p = CORPUS_DIR / "B_invoice_scanned.pdf"
    res = engine.extract(p, document_id="matrix_pdf_scanned")
    _assert_unstructured_contract(res, "PDF")
    assert "PAGE 1" in res.raw_text
    assert "TAX INVOICE" in res.raw_text or "INVOICE" in res.raw_text


# 3. PDF mixed
def test_matrix_pdf_mixed(engine):
    p = CORPUS_DIR / "H_multipage.pdf"
    res = engine.extract(p, document_id="matrix_pdf_mixed")
    _assert_unstructured_contract(res, "PDF")
    assert res.pages_processed >= 2
    assert "PAGE 1" in res.raw_text
    assert "PAGE 2" in res.raw_text


# 4. DOC (Legacy)
def test_matrix_doc(engine):
    p = CORPUS_DIR / "F_legacy.doc"
    res = engine.extract(p, document_id="matrix_doc")
    _assert_unstructured_contract(res, "DOC")
    assert "INV-2026-0098" in res.raw_text


# 5. DOCX
def test_matrix_docx(engine):
    p = CORPUS_DIR / "E_business.docx"
    res = engine.extract(p, document_id="matrix_docx")
    _assert_unstructured_contract(res, "DOCX")
    assert "INV-2026-0098" in res.raw_text
    assert "Dell Latitude" in res.raw_text
    # Embedded image text verification
    assert "EMBEDDED IMAGE 1" in res.raw_text
    assert "APPROVED" in res.raw_text or "AUTHORIZATION" in res.raw_text


# 6. TXT
def test_matrix_txt(engine):
    p = CORPUS_DIR / "G_plain.txt"
    res = engine.extract(p, document_id="matrix_txt")
    _assert_unstructured_contract(res, "TXT")
    assert "Bill No:" in res.raw_text
    assert "INV-2026-0098" in res.raw_text
    assert "Bill To:" in res.raw_text
    assert "ABC INDUSTRIES LTD" in res.raw_text
    assert "Grand Total:" in res.raw_text
    assert "Rs. 48,500" in res.raw_text


# 7. JPG
def test_matrix_jpg(engine):
    p = CORPUS_DIR / "D_invoice.jpg"
    res = engine.extract(p, document_id="matrix_jpg")
    _assert_unstructured_contract(res, "JPG")
    assert res.extraction_confidence is not None


# 8. JPEG
def test_matrix_jpeg(engine):
    p = CORPUS_DIR / "07_statement.jpeg"
    res = engine.extract(p, document_id="matrix_jpeg")
    _assert_unstructured_contract(res, "JPEG")
    assert res.extraction_confidence is not None


# 9. PNG
def test_matrix_png(engine):
    p = CORPUS_DIR / "C_invoice.png"
    res = engine.extract(p, document_id="matrix_png")
    _assert_unstructured_contract(res, "PNG")
    assert res.extraction_confidence is not None


# 10. Unicode & Currency Symbols
def test_matrix_unicode(engine):
    p = CORPUS_DIR / "J_unicode.txt"
    res = engine.extract(p, document_id="matrix_unicode")
    _assert_unstructured_contract(res, "TXT")
    assert "₹48,500.00" in res.raw_text
    assert "€550.00" in res.raw_text
    assert "$600.00" in res.raw_text
    assert "£480.00" in res.raw_text
    assert "¥88,000" in res.raw_text


# 11. Numbers & Identifiers
def test_matrix_numbers(engine):
    p = CORPUS_DIR / "K_numbers.txt"
    res = engine.extract(p, document_id="matrix_numbers")
    _assert_unstructured_contract(res, "TXT")
    assert "29AAACB1234C1Z6" in res.raw_text
    assert "AAACB1234C" in res.raw_text
    assert "HDFC0001234" in res.raw_text
    assert "50200012345678" in res.raw_text


# 12. Tables Layout
def test_matrix_tables(engine):
    p = CORPUS_DIR / "I_document_with_tables.pdf"
    res = engine.extract(p, document_id="matrix_tables")
    _assert_unstructured_contract(res, "PDF")
    assert "Dell Latitude" in res.raw_text
    assert "58,500.00" in res.raw_text


# 13. Low quality scan / noisy image
def test_matrix_low_quality_scan(engine):
    p = CORPUS_DIR / "L_low_quality_scan.png"
    res = engine.extract(p, document_id="matrix_low_quality")
    _assert_unstructured_contract(res, "PNG")


# 14. Bad input handling
def test_matrix_bad_input(engine):
    p = Path("non_existent_file_xyz.pdf")
    res = engine.extract(p, document_id="matrix_bad_input")
    assert res.status == ExtractionStatus.FAILED
    assert res.error_code is not None


# 15. Security path traversal
def test_matrix_security_traversal(engine):
    p = CORPUS_DIR / "G_plain.txt"
    res = engine.extract(p, document_id="../../evil_file")
    assert res.status == ExtractionStatus.FAILED
    assert res.error_code in ("SECURITY_VIOLATION", "SECURITY_ERROR")
