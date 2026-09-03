"""Tests for legacy DOC extraction handler."""
from pathlib import Path
from cor_engine.extractor import CorExtractor
from cor_engine.models import ErrorCode, ExtractionStatus


def test_legacy_doc_safe_stream_fallback(tmp_path, test_output_dir):
    """Test legacy DOC extraction with synthetic OLE2 stream containing UTF-16LE text."""
    p = tmp_path / "legacy_contract.doc"
    # Create synthetic OLE2-like binary file with header and utf-16le text run
    header = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 504
    text_content = "Purchase Order No: PO-2026-7788\nVendor: International Paper Co\nTotal: $ 8,500.00"
    utf16_run = text_content.encode("utf-16le")
    body = b"\x00" * 200 + utf16_run + b"\x00" * 300

    p.write_bytes(header + body)

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="legacy_doc")

    # Safe stream fallback should recover the UTF-16LE text without error
    assert result.status == ExtractionStatus.SUCCESS
    assert "PO-2026-7788" in result.raw_text
    assert "International Paper" in result.raw_text


def test_legacy_doc_without_converter_or_text(tmp_path, test_output_dir):
    """Test legacy DOC when binary contains no extractable text."""
    p = tmp_path / "empty_corrupt.doc"
    # OLE header with purely random binary noise (no text runs)
    header = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 504
    p.write_bytes(header + b"\x01\x02\x03\x04" * 100)

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="empty_legacy")

    # Should report structured failure gracefully, without crashing
    assert result.status == ExtractionStatus.FAILED
    assert result.error_code in (ErrorCode.DOC_CONVERTER_UNAVAILABLE.value, ErrorCode.EXTRACTION_FAILED.value)
