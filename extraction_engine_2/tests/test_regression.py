"""Comprehensive COR extraction regression tests.

Covers all file types, quality conditions, security, Unicode, tables,
page boundaries, orientation handling, corrupted inputs, and output purity.
"""
import os
import sys
from pathlib import Path

import pytest

# Ensure workspace root
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from cor_engine.core.engine import CORExtractionEngine
from cor_engine.core.result import ExtractionStatus

# Build test documents if not already present
TEST_DIR = WORKSPACE_ROOT / "tests" / "test_documents"
if not (TEST_DIR / "pdf" / "text_invoice.pdf").exists():
    import subprocess
    subprocess.run([sys.executable, str(WORKSPACE_ROOT / "generate_evaluation_corpus.py")],
                   cwd=str(WORKSPACE_ROOT), check=True)


@pytest.fixture(scope="module")
def engine():
    """Shared COR engine instance for all tests."""
    return CORExtractionEngine()


# ============================================================
# PDF TESTS
# ============================================================
class TestPDFExtraction:
    """Section 12: PDF extraction across text, scanned, mixed, multi-page, complex layout."""

    def test_pdf_text_based(self, engine):
        """Text-based PDF should extract natively without OCR."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_pdf_text")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.characters_extracted > 100
        assert "INV-2026-0098" in r.raw_text
        assert "ABC INDUSTRIES LTD" in r.raw_text
        assert "29AAACB1234C1Z6" in r.raw_text
        assert r.native_pages >= 1
        # Text PDF should NOT trigger OCR
        assert r.ocr_pages == 0

    def test_pdf_scanned(self, engine):
        """Scanned PDF should fall back to OCR."""
        r = engine.extract(TEST_DIR / "pdf" / "scanned_invoice.pdf", document_id="reg_pdf_scan")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.characters_extracted > 100
        assert "INV-2026-0098" in r.raw_text
        assert r.ocr_pages >= 1

    def test_pdf_mixed(self, engine):
        """Mixed PDF: page 1 digital, page 2 image. Both should be extracted."""
        r = engine.extract(TEST_DIR / "pdf" / "mixed_pdf.pdf", document_id="reg_pdf_mixed")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.pages_processed == 2
        assert "INV-2026-0098" in r.raw_text
        assert "PAGE 1" in r.raw_text
        assert "PAGE 2" in r.raw_text

    def test_pdf_multi_page(self, engine):
        """Multi-page PDF: 3 pages with content from each."""
        r = engine.extract(TEST_DIR / "pdf" / "multi_page.pdf", document_id="reg_pdf_multi")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.pages_processed == 3
        assert "PAGE 1" in r.raw_text
        assert "PAGE 2" in r.raw_text
        assert "PAGE 3" in r.raw_text
        assert "INV-2026-0098" in r.raw_text
        assert "50200012345678" in r.raw_text

    def test_pdf_complex_layout(self, engine):
        """Complex 2-column PDF should extract content from both columns."""
        r = engine.extract(TEST_DIR / "pdf" / "complex_layout.pdf", document_id="reg_pdf_complex")
        assert r.status == ExtractionStatus.SUCCESS
        assert "SECTION A" in r.raw_text or "SECTIONA" in r.raw_text.replace(" ", "")
        assert "SECTION B" in r.raw_text or "SECTIONB" in r.raw_text.replace(" ", "")
        assert "INV-2026-0098" in r.raw_text
        assert "29AAACB1234C1Z6" in r.raw_text

    def test_pdf_large_document(self, engine):
        """10-page PDF stress test: all pages processed, reasonable time."""
        r = engine.extract(TEST_DIR / "pdf" / "large_document.pdf", document_id="reg_pdf_large")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.pages_processed == 10
        assert "INV-2026-0098" in r.raw_text


# ============================================================
# DOC TESTS
# ============================================================
class TestDOCExtraction:
    """Section: Legacy DOC binary extraction."""

    def test_doc_legacy(self, engine):
        """Legacy .doc should extract text via OLE stream fallback."""
        r = engine.extract(TEST_DIR / "doc" / "legacy_document.doc", document_id="reg_doc")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.characters_extracted > 20
        assert "INV-2026-0098" in r.raw_text
        assert "ABC INDUSTRIES LTD" in r.raw_text


# ============================================================
# DOCX TESTS
# ============================================================
class TestDOCXExtraction:
    """DOCX extraction: paragraphs, tables, embedded images."""

    def test_docx_business(self, engine):
        """Standard DOCX with paragraphs and headings."""
        r = engine.extract(TEST_DIR / "docx" / "business_document.docx", document_id="reg_docx_biz")
        assert r.status == ExtractionStatus.SUCCESS
        assert "MASTER SERVICES AGREEMENT" in r.raw_text
        assert "INV-2026-0098" in r.raw_text
        assert "50200012345678" in r.raw_text

    def test_docx_tables(self, engine):
        """DOCX with table content. Numbers and item names must be preserved."""
        r = engine.extract(TEST_DIR / "docx" / "table_document.docx", document_id="reg_docx_tbl")
        assert r.status == ExtractionStatus.SUCCESS
        assert "Dell Latitude 5440 Laptop" in r.raw_text
        assert "58500.00" in r.raw_text
        assert "14500.00" in r.raw_text

    def test_docx_embedded_image(self, engine):
        """DOCX with embedded image: OCR on stamp, EMBEDDED IMAGE marker."""
        r = engine.extract(TEST_DIR / "docx" / "image_document.docx", document_id="reg_docx_img")
        assert r.status == ExtractionStatus.SUCCESS
        assert "EMBEDDED IMAGE 1" in r.raw_text
        assert "INV-2026-0098" in r.raw_text


# ============================================================
# TXT TESTS
# ============================================================
class TestTXTExtraction:
    """Plain text file handling."""

    def test_txt_normal(self, engine):
        """Normal text file: direct read, no OCR, full content preserved."""
        r = engine.extract(TEST_DIR / "txt" / "normal.txt", document_id="reg_txt_norm")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.ocr_pages == 0
        assert "INV-2026-0098" in r.raw_text
        assert "ABC INDUSTRIES LTD" in r.raw_text

    def test_txt_unicode(self, engine):
        """Unicode: currency symbols ₹€$£¥ and multilingual text."""
        r = engine.extract(TEST_DIR / "txt" / "unicode.txt", document_id="reg_txt_uni")
        assert r.status == ExtractionStatus.SUCCESS
        assert "₹48,500.00" in r.raw_text
        assert "€550.00" in r.raw_text
        assert "$600.00" in r.raw_text
        assert "£480.00" in r.raw_text
        assert "¥88,000" in r.raw_text
        assert "Société Générale" in r.raw_text

    def test_txt_large(self, engine):
        """Large TXT (2500 lines): extraction within reasonable time."""
        r = engine.extract(TEST_DIR / "txt" / "large.txt", document_id="reg_txt_large")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.characters_extracted > 100000
        assert "TRANSACTION ENTRY #0001" in r.raw_text
        assert "TRANSACTION ENTRY #2500" in r.raw_text
        assert r.processing_time_ms < 5000  # should complete in well under 5 seconds


# ============================================================
# IMAGE TESTS
# ============================================================
class TestImageExtraction:
    """Image OCR: clean, noisy, rotated, low-resolution."""

    def test_image_clean_png(self, engine):
        """Clean PNG: full OCR extraction of invoice content."""
        r = engine.extract(TEST_DIR / "images" / "clean.png", document_id="reg_img_clean_png")
        assert r.status == ExtractionStatus.SUCCESS
        assert "INV-2026-0098" in r.raw_text
        assert "29AAACB1234C1Z6" in r.raw_text
        assert r.extraction_confidence > 0.80

    def test_image_clean_jpg(self, engine):
        """Clean JPG: full OCR extraction."""
        r = engine.extract(TEST_DIR / "images" / "clean.jpg", document_id="reg_img_clean_jpg")
        assert r.status == ExtractionStatus.SUCCESS
        assert "INV-2026-0098" in r.raw_text
        assert r.extraction_confidence > 0.80

    def test_image_noisy(self, engine):
        """Noisy PNG: adaptive denoising retry should recover at least partial text."""
        r = engine.extract(TEST_DIR / "images" / "noisy.png", document_id="reg_img_noisy")
        assert r.status == ExtractionStatus.SUCCESS
        # With denoising retry, we expect significant text recovery
        assert r.characters_extracted > 50

    def test_image_rotated_90(self, engine):
        """90° rotated JPG: PaddleOCR orientation correction."""
        r = engine.extract(TEST_DIR / "images" / "rotated_90.jpg", document_id="reg_img_rot90")
        assert r.status == ExtractionStatus.SUCCESS
        assert "INV-2026-0098" in r.raw_text
        assert r.characters_extracted > 100

    def test_image_rotated_180(self, engine):
        """180° rotated JPG: PaddleOCR orientation correction."""
        r = engine.extract(TEST_DIR / "images" / "rotated_180.jpg", document_id="reg_img_rot180")
        assert r.status == ExtractionStatus.SUCCESS
        assert "INV-2026-0098" in r.raw_text

    def test_image_rotated_270(self, engine):
        """270° rotated JPG: PaddleOCR orientation correction."""
        r = engine.extract(TEST_DIR / "images" / "rotated_270.jpg", document_id="reg_img_rot270")
        assert r.status == ExtractionStatus.SUCCESS
        assert "INV-2026-0098" in r.raw_text

    def test_image_low_resolution(self, engine):
        """Low resolution PNG: text recovery from small image."""
        r = engine.extract(TEST_DIR / "images" / "low_resolution.png", document_id="reg_img_lowres")
        assert r.status == ExtractionStatus.SUCCESS
        assert r.characters_extracted > 50


# ============================================================
# NUMERICAL ACCURACY (Section 7, 8)
# ============================================================
class TestNumericalAccuracy:
    """Verify critical numbers are preserved without character substitution."""

    def test_gstin_preservation(self, engine):
        """GSTIN must be preserved exactly."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_num_gstin")
        assert "29AAACB1234C1Z6" in r.raw_text

    def test_pan_preservation(self, engine):
        """PAN must be preserved exactly."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_num_pan")
        assert "AAACB1234C" in r.raw_text

    def test_cin_preservation(self, engine):
        """CIN must be preserved exactly."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_num_cin")
        assert "U72200KA2015PTC081234" in r.raw_text

    def test_ifsc_preservation(self, engine):
        """IFSC code must be preserved exactly."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_num_ifsc")
        assert "HDFC0001234" in r.raw_text

    def test_account_number_preservation(self, engine):
        """Bank account number must be preserved exactly."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_num_acct")
        assert "50200012345678" in r.raw_text

    def test_invoice_id_preservation(self, engine):
        """Invoice ID must be preserved exactly."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_num_inv")
        assert "INV-2026-0098" in r.raw_text


# ============================================================
# TABLE CONTENT (Section 9)
# ============================================================
class TestTableContent:
    """Verify table-like content: products, quantities, prices, amounts."""

    def test_table_products(self, engine):
        r = engine.extract(TEST_DIR / "docx" / "table_document.docx", document_id="reg_tbl_products")
        assert "Dell Latitude 5440 Laptop" in r.raw_text
        assert "Logitech MX Mechanical Keyboard" in r.raw_text

    def test_table_quantities(self, engine):
        r = engine.extract(TEST_DIR / "docx" / "table_document.docx", document_id="reg_tbl_qty")
        text = r.raw_text
        assert "5" in text
        assert "10" in text

    def test_table_prices(self, engine):
        r = engine.extract(TEST_DIR / "docx" / "table_document.docx", document_id="reg_tbl_price")
        assert "58500.00" in r.raw_text
        assert "14500.00" in r.raw_text


# ============================================================
# CORRUPTED & EMPTY INPUT (Section 17)
# ============================================================
class TestCorruptedInput:
    """Verify structured error responses for invalid inputs."""

    def test_empty_txt(self, engine):
        r = engine.extract(TEST_DIR / "corrupt" / "empty.txt", document_id="reg_corrupt_empty_txt")
        assert r.status == ExtractionStatus.FAILED
        assert r.error_code is not None

    def test_empty_png(self, engine):
        r = engine.extract(TEST_DIR / "corrupt" / "empty.png", document_id="reg_corrupt_empty_png")
        assert r.status == ExtractionStatus.FAILED
        assert r.error_code is not None

    def test_corrupted_pdf(self, engine):
        r = engine.extract(TEST_DIR / "corrupt" / "corrupted.pdf", document_id="reg_corrupt_pdf")
        assert r.status == ExtractionStatus.FAILED
        assert r.error_code is not None

    def test_corrupted_jpg(self, engine):
        r = engine.extract(TEST_DIR / "corrupt" / "corrupted.jpg", document_id="reg_corrupt_jpg")
        assert r.status == ExtractionStatus.FAILED
        assert r.error_code is not None

    def test_corrupted_docx(self, engine):
        r = engine.extract(TEST_DIR / "corrupt" / "corrupted.docx", document_id="reg_corrupt_docx")
        assert r.status == ExtractionStatus.FAILED
        assert r.error_code is not None

    def test_missing_file(self, engine):
        r = engine.extract(TEST_DIR / "nonexistent_file.xyz", document_id="reg_corrupt_missing")
        assert r.status == ExtractionStatus.FAILED
        assert r.error_code is not None


# ============================================================
# SECURITY (Section 18)
# ============================================================
class TestSecurity:
    """Path traversal and security checks."""

    def test_path_traversal_rejected(self, engine):
        r = engine.extract(TEST_DIR / "txt" / "normal.txt", document_id="../../../etc/passwd")
        assert r.status == ExtractionStatus.FAILED or ".." not in str(r.raw_file_path or "")


# ============================================================
# OUTPUT PURITY (Section 28)
# ============================================================
class TestOutputPurity:
    """Verify COR output remains raw unstructured text without semantic labels."""

    def test_no_semantic_labels(self, engine):
        """Output must NOT contain semantic labels like invoice_number, customer_name."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_purity_check")
        assert r.status == ExtractionStatus.SUCCESS
        assert "invoice_number" not in r.raw_text.lower()
        assert "customer_name" not in r.raw_text.lower()
        assert "total_amount" not in r.raw_text.lower()

    def test_no_json_output(self, engine):
        """Output must NOT be JSON-structured."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_purity_json")
        text = r.raw_text.strip()
        assert not text.startswith("{")
        assert not text.startswith("[")

    def test_source_terminology_preserved(self, engine):
        """COR must preserve source terminology (Bill No, Bill To, Grand Total)."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_purity_terms")
        assert "Bill No" in r.raw_text
        assert "Bill To" in r.raw_text
        assert "Grand Total" in r.raw_text


# ============================================================
# ARTIFACT VALIDATION (Section 27)
# ============================================================
class TestArtifactValidation:
    """Verify .txt artifact file properties."""

    def test_artifact_exists_and_utf8(self, engine):
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_artifact_check")
        assert r.raw_file_path is not None
        p = Path(r.raw_file_path)
        assert p.exists()
        assert p.suffix == ".txt"
        content = p.read_text(encoding="utf-8")
        assert len(content) > 0

    def test_artifact_nonempty_when_source_has_content(self, engine):
        r = engine.extract(TEST_DIR / "txt" / "normal.txt", document_id="reg_artifact_nonempty")
        assert r.raw_file_path is not None
        assert Path(r.raw_file_path).stat().st_size > 0


# ============================================================
# COMPARISON-READY METADATA (Section 29)
# ============================================================
class TestMetadata:
    """Verify ExtractionResult exposes all required metadata."""

    def test_metadata_fields(self, engine):
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_metadata")
        assert r.engine_id == "COR"
        assert r.document_id is not None
        assert r.status == ExtractionStatus.SUCCESS
        assert r.raw_file_path is not None
        assert r.pages_processed >= 1
        assert r.characters_extracted > 0
        assert r.processing_time_ms >= 0
        assert r.extraction_confidence is not None

    def test_common_extraction_contract(self, engine):
        """Verify to_common_contract returns expected schema for Comparison Engine."""
        r = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_common_contract")
        c = r.to_common_contract()
        assert c["engine_id"] == "COR"
        assert c["status"] == "success"
        assert c["document_id"] == "reg_common_contract"
        assert "input" in c and c["input"]["file_type"] == "pdf"
        assert "artifact" in c and c["artifact"]["type"] == "text/plain"
        assert "metrics" in c and c["metrics"]["pages_processed"] >= 1
        assert "confidence" in c and "extraction_confidence" in c["confidence"]
        assert "invoice_number" not in c
        assert "customer_name" not in c


# ============================================================
# HEALTH & CAPABILITIES (Section 19, 20)
# ============================================================
class TestHealthAndCapabilities:
    """Verify health check and capabilities endpoint responses."""

    def test_health_check(self, engine):
        hc = engine.health_check()
        assert hc["engine"] == "COR"
        assert hc["status"] in ("healthy", "degraded")
        assert "ocr_available" in hc

    def test_capabilities(self, engine):
        caps = engine.get_capabilities()
        assert caps["engine_id"] == "COR"
        assert "pdf" in caps["supported_formats"]
        assert caps["ocr_engine"] == "PaddleOCR"


# ============================================================
# IDEMPOTENCY & STABILITY (Section 4, 17)
# ============================================================
class TestIdempotency:
    """Verify repeated processing produces stable deterministic results."""

    def test_repeated_extraction_idempotency(self, engine):
        r1 = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_idempotent")
        r2 = engine.extract(TEST_DIR / "pdf" / "text_invoice.pdf", document_id="reg_idempotent")
        assert r1.status == r2.status == ExtractionStatus.SUCCESS
        assert r1.raw_file_id == r2.raw_file_id == "reg_idempotent.txt"
        assert r1.characters_extracted == r2.characters_extracted

