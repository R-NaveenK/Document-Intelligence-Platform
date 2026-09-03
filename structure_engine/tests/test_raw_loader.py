import pytest
from pathlib import Path
from app.input.raw_document_loader import RawDocumentLoader
from app.core.exceptions import (
    RawArtifactNotFoundError,
    EmptyRawArtifactError,
    SecurityPathTraversalError,
    InvalidDocumentIdError,
    OversizedDocumentError
)

@pytest.fixture
def loader():
    return RawDocumentLoader()

def test_loader_load_txt_file(loader):
    """Tests loading a standard text file from trusted storage."""
    raw_input = loader.load(document_id="doc_20260903_001")
    assert raw_input.document_id == "doc_20260903_001"
    assert "NDS/SEP/26/0734" in raw_input.raw_text
    assert len(raw_input.raw_text) > 50

def test_loader_load_json_file(loader):
    """Tests loading a json artifact file."""
    raw_input = loader.load(document_id="sample_invoice_extraction")
    assert raw_input.document_id == "DOC-SAMPLE-INV-0897"
    assert "TSPL/INV/2026-27/0897" in raw_input.raw_text
    assert len(raw_input.pages) >= 1

def test_loader_multipage_detection(loader):
    """Tests automatic page splitting for multi-page raw files."""
    raw_input = loader.load(document_id="doc_large_50page")
    assert len(raw_input.pages) == 50
    assert raw_input.pages[0].page_number == 1
    assert "PAGE 1 of 50" in raw_input.pages[0].raw_text

def test_loader_unicode_content(loader):
    """Tests loading unicode characters (accented, euro, german)."""
    raw_input = loader.load(document_id="doc_unicode")
    assert "München Büromöbel" in raw_input.raw_text
    assert "€14,940.60" in raw_input.raw_text

def test_loader_missing_file(loader):
    """Tests missing document ID raises RawArtifactNotFoundError."""
    with pytest.raises(RawArtifactNotFoundError) as exc_info:
        loader.load(document_id="non_existent_doc_99999")
    assert "RAW_ARTIFACT_NOT_FOUND" == exc_info.value.error_code

def test_loader_empty_file(loader):
    """Tests empty file raises EmptyRawArtifactError."""
    with pytest.raises(EmptyRawArtifactError) as exc_info:
        loader.load(document_id="empty_doc")
    assert "EMPTY_RAW_ARTIFACT_ERROR" == exc_info.value.error_code

def test_loader_security_path_traversal_parent(loader):
    """Tests path traversal attempt with ../ raises SecurityPathTraversalError."""
    with pytest.raises(SecurityPathTraversalError):
        loader.load(document_id="../etc/passwd")

def test_loader_security_path_traversal_win_parent(loader):
    """Tests path traversal attempt with ..\\ raises SecurityPathTraversalError."""
    with pytest.raises(SecurityPathTraversalError):
        loader.load(document_id="..\\..\\windows\\system32")

def test_loader_security_null_byte(loader):
    """Tests null byte injection raises SecurityPathTraversalError."""
    with pytest.raises(SecurityPathTraversalError):
        loader.load(document_id="doc_test\x00.txt")

def test_loader_security_slash_in_doc_id(loader):
    """Tests slashes in pure document_id raise InvalidDocumentIdError."""
    with pytest.raises(InvalidDocumentIdError):
        loader.load(document_id="subfolder/doc_test")

def test_loader_oversized_limit(loader, monkeypatch):
    """Tests file size limit enforcement raises OversizedDocumentError."""
    monkeypatch.setattr("app.core.config.settings.MAX_TEXT_LENGTH_BYTES", 100)
    with pytest.raises(OversizedDocumentError) as exc_info:
        loader.load(document_id="doc_20260903_001")
    assert "OVERSIZED_DOCUMENT_ERROR" == exc_info.value.error_code
