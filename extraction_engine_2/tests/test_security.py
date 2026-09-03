"""Security, error handling, and robustness tests."""
from pathlib import Path
import pytest
from cor_engine.extractor import CorExtractor
from cor_engine.models import ErrorCode, ExtractionStatus
from cor_engine.utils.security import sanitize_document_id


def test_path_traversal_in_doc_id(tmp_path, test_output_dir):
    """Test that path traversal attempts in document_id are blocked."""
    p = tmp_path / "valid.txt"
    p.write_text("Hello World", encoding="utf-8")

    extractor = CorExtractor(output_dir=test_output_dir)

    # Attempt directory escape
    result = extractor.extract(p, document_id="../../evil_payload")
    assert result.status == ExtractionStatus.FAILED
    assert result.error_code == ErrorCode.SECURITY_VIOLATION.value

    # Verify no file was written outside test_output_dir
    outside_file = test_output_dir.parent / "evil_payload.txt"
    assert not outside_file.exists()


def test_sanitize_doc_id_with_special_chars():
    clean_id = sanitize_document_id("invoice #123 (v2)*?.pdf")
    assert "/" not in clean_id
    assert "\\" not in clean_id
    assert "#" not in clean_id
    assert "(" not in clean_id


def test_unsupported_file_extension(tmp_path, test_output_dir):
    p = tmp_path / "program.exe"
    p.write_bytes(b"MZ\x90\x00\x03\x00\x00\x00")

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="exe_test")

    assert result.status == ExtractionStatus.FAILED
    assert result.error_code == ErrorCode.UNSUPPORTED_FILE_TYPE.value


def test_corrupted_pdf_file(tmp_path, test_output_dir):
    p = tmp_path / "corrupted.pdf"
    # Write invalid PDF header & junk
    p.write_bytes(b"%PDF-1.4\nJUNKDATA-CORRUPTED-STREAM-NOT-A-REAL-PDF")

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="corrupt_pdf")

    assert result.status == ExtractionStatus.FAILED
    assert result.error_code in (
        ErrorCode.PDF_PROCESSING_ERROR.value,
        ErrorCode.CORRUPT_DOCUMENT.value,
        ErrorCode.INVALID_FILE.value,
        ErrorCode.EXTRACTION_FAILED.value,
    )


def test_missing_input_file(tmp_path, test_output_dir):
    missing_path = tmp_path / "does_not_exist_at_all.png"

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(missing_path, document_id="missing_file")

    assert result.status == ExtractionStatus.FAILED
    assert result.error_code == ErrorCode.FILE_NOT_FOUND.value
