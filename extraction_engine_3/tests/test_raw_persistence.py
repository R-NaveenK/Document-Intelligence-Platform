import os
import re
import pytest
from pathlib import Path

from app.engine import ExtractionEngine
from app.models.extraction_result import ExtractionResult, PageResult, ExtractionStatus
from app.ocr.base import BaseExtractionEngine
from app.storage.raw_storage import (
    validate_document_id,
    generate_document_id,
    format_raw_text,
    persist_raw_extraction,
)
from app.core.exceptions import InvalidDocumentIdError, StorageError
from app.core.config import settings


class MockCustomEngine(BaseExtractionEngine):
    """Custom pluggable engine used for controlled persistence testing."""

    def __init__(self, pages=None, raw_text="", status=ExtractionStatus.SUCCESS):
        self.pages = pages or []
        self.raw_text = raw_text
        self.status = status

    def extract(self, document, original_filename=None, document_id=None, options=None):
        return ExtractionResult(
            engine_id="mock_engine",
            status=self.status,
            raw_text=self.raw_text,
            pages=self.pages,
            extraction_confidence=0.99 if self.status == ExtractionStatus.SUCCESS else 0.0,
            pages_processed=len(self.pages),
            document_id=document_id,
            original_filename=original_filename,
        )

    def get_engine_id(self):
        return "mock_engine"

    def get_version(self):
        return "1.0.0"

    def health_check(self):
        return {"status": "healthy"}


def test_1_single_page_document_persistence(tmp_path, monkeypatch):
    """1. Single-page document persistence test."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    page_text = (
        "TAX INVOICE\n"
        "TECHNOVISTA SOLUTIONS PRIVATE LIMITED\n"
        "Document Reference: TX/26-27/1847\n"
        "Total Amount: Rs. 62,500"
    )
    pages = [PageResult(page_number=1, raw_text=page_text, confidence=0.98, character_count=len(page_text), word_count=13)]

    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text=page_text))
    result = engine.extract("invoice_single.pdf", original_filename="invoice_single.pdf", document_id="doc_single_001")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.document_id == "doc_single_001"
    assert result.raw_file_id == "doc_single_001.txt"
    assert result.raw_file_path is not None

    artifact_file = tmp_path / "doc_single_001.txt"
    assert artifact_file.exists()

    # Verify UTF-8 and content matches exactly
    saved_content = artifact_file.read_text(encoding="utf-8")
    assert saved_content == page_text


def test_2_multi_page_document_persistence(tmp_path, monkeypatch):
    """2. Multi-page document with preserved page boundaries."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    p1_text = "PAGE 1 CONTENT\nINVOICE HEADER\nTECHNOVISTA SOLUTIONS"
    p2_text = "PAGE 2 CONTENT\nLINE ITEMS\nDell Latitude 5450 - Qty: 4"
    p3_text = "PAGE 3 CONTENT\nPAYMENT DETAILS\nBank: HDFC Bank"

    pages = [
        PageResult(page_number=1, raw_text=p1_text, confidence=0.95, character_count=len(p1_text), word_count=6),
        PageResult(page_number=2, raw_text=p2_text, confidence=0.96, character_count=len(p2_text), word_count=8),
        PageResult(page_number=3, raw_text=p3_text, confidence=0.97, character_count=len(p3_text), word_count=6),
    ]

    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text="\n\n".join([p1_text, p2_text, p3_text])))
    result = engine.extract("multi_page.pdf", original_filename="multi_page.pdf", document_id="doc_multi_002")

    assert result.status == ExtractionStatus.SUCCESS
    artifact_file = tmp_path / "doc_multi_002.txt"
    assert artifact_file.exists()

    content = artifact_file.read_text(encoding="utf-8")

    # Verify standard page boundary markers are preserved
    assert "----------------------------------------\nPAGE 1\n----------------------------------------" in content
    assert "----------------------------------------\nPAGE 2\n----------------------------------------" in content
    assert "----------------------------------------\nPAGE 3\n----------------------------------------" in content

    # Verify all content from all pages is preserved
    assert "TECHNOVISTA SOLUTIONS" in content
    assert "Dell Latitude 5450 - Qty: 4" in content
    assert "Bank: HDFC Bank" in content


def test_3_unicode_text_persistence(tmp_path, monkeypatch):
    """3. Unicode characters (₹, €, $, accents, multilingual Hindi/Japanese)."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    unicode_text = (
        "Currencies: ₹ 1,24,500.00 | € 450.50 | $ 500.00 | £ 320.00 | ¥ 50,000\n"
        "Accents: Café, Naïve, façade, Über, señor\n"
        "Multilingual: कर चालान (Tax Invoice) / 領収書 (Receipt)\n"
        "Symbols: © 2026 ® ™ № 1847/26"
    )
    pages = [PageResult(page_number=1, raw_text=unicode_text, confidence=0.99, character_count=len(unicode_text), word_count=25)]

    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text=unicode_text))
    result = engine.extract("doc_unicode.pdf", document_id="doc_unicode_003")

    assert result.status == ExtractionStatus.SUCCESS
    artifact_file = tmp_path / "doc_unicode_003.txt"
    assert artifact_file.exists()

    # Raw bytes check to guarantee strict UTF-8
    raw_bytes = artifact_file.read_bytes()
    decoded = raw_bytes.decode("utf-8")
    assert decoded == unicode_text
    assert "₹ 1,24,500.00" in decoded
    assert "€ 450.50" in decoded
    assert "कर चालान" in decoded
    assert "領収書" in decoded


def test_4_numerical_values_persistence(tmp_path, monkeypatch):
    """4. Numerical values, rates, totals, decimals, and invoice identifiers."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    numerical_text = (
        "Bill No: INV-2026-0098\n"
        "Date: 2026-09-03\n"
        "Item 1: Qty 10 @ Rs. 1,250.50 = 12,505.00\n"
        "Item 2: Qty 5 @ Rs. 2,400.00 = 12,000.00\n"
        "Subtotal: 24,505.00\n"
        "CGST (9%): 2,205.45\n"
        "SGST (9%): 2,205.45\n"
        "Grand Total: 28,915.90\n"
        "HSN Code: 84713010"
    )
    pages = [PageResult(page_number=1, raw_text=numerical_text, confidence=0.99, character_count=len(numerical_text), word_count=35)]

    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text=numerical_text))
    result = engine.extract("numerical.pdf", document_id="doc_num_004")

    artifact_file = tmp_path / "doc_num_004.txt"
    saved = artifact_file.read_text(encoding="utf-8")
    assert "INV-2026-0098" in saved
    assert "24,505.00" in saved
    assert "28,915.90" in saved
    assert "84713010" in saved


def test_5_empty_extraction_handling(tmp_path, monkeypatch):
    """5. Successfully processed blank document with empty extraction."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    pages = [PageResult(page_number=1, raw_text="", confidence=1.0, character_count=0, word_count=0)]
    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text=""))
    result = engine.extract("blank.pdf", document_id="doc_blank_005")

    assert result.status == ExtractionStatus.SUCCESS
    artifact_file = tmp_path / "doc_blank_005.txt"
    assert artifact_file.exists()
    assert artifact_file.read_text(encoding="utf-8") == ""


def test_6_extraction_failure_no_misleading_file(tmp_path, monkeypatch):
    """6. Complete extraction failure must not create a misleading successful raw file."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=[], raw_text="", status=ExtractionStatus.ERROR))
    result = engine.extract("corrupted.pdf", document_id="doc_fail_006")

    assert result.status == ExtractionStatus.ERROR
    assert result.raw_file_path is None
    assert result.raw_file_id is None

    artifact_file = tmp_path / "doc_fail_006.txt"
    assert not artifact_file.exists()


def test_7_output_directory_creation(tmp_path):
    """7. Deeply nested missing output directory is created automatically."""
    nested_dir = tmp_path / "deep" / "nested" / "raw_artifacts"
    assert not nested_dir.exists()

    path, fid = persist_raw_extraction("doc_nested_007", "Sample Content", output_dir=str(nested_dir))
    assert nested_dir.exists()
    target_file = nested_dir / "doc_nested_007.txt"
    assert target_file.exists()
    assert target_file.read_text(encoding="utf-8") == "Sample Content"


def test_8_file_naming_conventions(tmp_path, monkeypatch):
    """8. File naming: Explicit document_id vs auto-generated document_id."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    # Auto-generated ID format
    generated_id = generate_document_id()
    assert re.match(r"^doc_\d{8}_\d{6}_[a-f0-9]{8}$", generated_id)

    # Validated explicit ID
    explicit_id = "DOC-INV-2026_0903"
    validated = validate_document_id(explicit_id)
    assert validated == explicit_id

    pages = [PageResult(page_number=1, raw_text="Auto named doc", confidence=0.9, character_count=14, word_count=3)]
    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text="Auto named doc"))
    result = engine.extract("auto.pdf")

    assert result.document_id.startswith("doc_")
    assert result.raw_file_id == f"{result.document_id}.txt"
    assert (tmp_path / result.raw_file_id).exists()


def test_9_duplicate_processing_atomic_overwrite(tmp_path, monkeypatch):
    """9. Duplicate processing cleanly overwrites without leaving corrupted or temp files."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    doc_id = "doc_dup_009"
    engine_v1 = ExtractionEngine(engine_instance=MockCustomEngine(pages=[PageResult(page_number=1, raw_text="Version 1 text", confidence=0.9, character_count=14, word_count=3)], raw_text="Version 1 text"))
    res1 = engine_v1.extract("doc.pdf", document_id=doc_id)

    artifact_file = tmp_path / f"{doc_id}.txt"
    assert artifact_file.read_text(encoding="utf-8") == "Version 1 text"

    # Reprocess same document_id with updated extraction content
    engine_v2 = ExtractionEngine(engine_instance=MockCustomEngine(pages=[PageResult(page_number=1, raw_text="Version 2 updated text", confidence=0.95, character_count=22, word_count=4)], raw_text="Version 2 updated text"))
    res2 = engine_v2.extract("doc.pdf", document_id=doc_id)

    assert artifact_file.read_text(encoding="utf-8") == "Version 2 updated text"

    # Verify no temporary files remain (.tmp)
    temp_files = list(tmp_path.glob("*.tmp"))
    assert len(temp_files) == 0


def test_10_path_traversal_attempts_rejected(tmp_path):
    """10. Path traversal attacks and invalid characters in document_id must raise InvalidDocumentIdError."""
    unsafe_ids = [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "doc/../../secret",
        "doc/subfolder",
        "doc\\subfolder",
        "doc\0nullbyte",
        "doc:stream",
        "CON",
        "PRN",
        "NUL",
        "doc*star",
        "   ",
        "",
        None,
    ]

    for bad_id in unsafe_ids:
        with pytest.raises(InvalidDocumentIdError):
            validate_document_id(bad_id)

        with pytest.raises(InvalidDocumentIdError):
            persist_raw_extraction(bad_id, "Malicious Content", output_dir=str(tmp_path))


def test_11_large_extracted_text_persistence(tmp_path, monkeypatch):
    """11. Large extracted text volume (thousands of lines) preserved completely."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    large_lines = [f"Line {i}: Item code {1000+i}, Qty {i*2}, Description of purchased goods for invoice" for i in range(2000)]
    large_text = "\n".join(large_lines)

    pages = [PageResult(page_number=1, raw_text=large_text, confidence=0.99, character_count=len(large_text), word_count=len(large_text.split()))]
    engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text=large_text))
    result = engine.extract("large_doc.pdf", document_id="doc_large_011")

    artifact_file = tmp_path / "doc_large_011.txt"
    assert artifact_file.exists()

    saved_text = artifact_file.read_text(encoding="utf-8")
    assert len(saved_text) == len(large_text)
    assert saved_text.startswith("Line 0:")
    assert saved_text.endswith("purchased goods for invoice")


def test_12_multiple_documents_independent_persistence(tmp_path, monkeypatch):
    """12. Multiple documents processed independently each have their own artifact."""
    monkeypatch.setattr(settings, "RAW_EXTRACTION_DIR", str(tmp_path))

    doc_ids = ["doc_alpha_012", "doc_beta_012", "doc_gamma_012"]
    contents = ["Content for document Alpha", "Content for document Beta", "Content for document Gamma"]

    for d_id, text in zip(doc_ids, contents):
        pages = [PageResult(page_number=1, raw_text=text, confidence=0.9, character_count=len(text), word_count=4)]
        engine = ExtractionEngine(engine_instance=MockCustomEngine(pages=pages, raw_text=text))
        res = engine.extract(f"{d_id}.pdf", document_id=d_id)
        assert res.document_id == d_id
        assert res.raw_file_id == f"{d_id}.txt"

    for d_id, text in zip(doc_ids, contents):
        file_path = tmp_path / f"{d_id}.txt"
        assert file_path.exists()
        assert file_path.read_text(encoding="utf-8") == text
