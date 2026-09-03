"""Tests for file type detection and routing."""
import pytest
from cor_engine.router import SupportedFileType, detect_file_type
from cor_engine.exceptions import MissingFileError, UnsupportedFileTypeError


def test_detect_pdf(digital_pdf_file):
    assert detect_file_type(digital_pdf_file) == SupportedFileType.PDF


def test_detect_png(png_image_file):
    assert detect_file_type(png_image_file) == SupportedFileType.PNG


def test_detect_jpg(jpg_image_file):
    assert detect_file_type(jpg_image_file) in (SupportedFileType.JPG, SupportedFileType.JPEG)


def test_detect_docx(docx_file):
    assert detect_file_type(docx_file) == SupportedFileType.DOCX


def test_detect_txt(txt_file):
    assert detect_file_type(txt_file) == SupportedFileType.TXT


def test_detect_missing_file(tmp_path):
    non_existent = tmp_path / "does_not_exist.pdf"
    with pytest.raises(MissingFileError):
        detect_file_type(non_existent)


def test_detect_unsupported_file(tmp_path):
    unsupported = tmp_path / "binary_archive.bin"
    unsupported.write_bytes(b"\x00\x01\x02\x03\x04\x05")
    with pytest.raises(UnsupportedFileTypeError):
        detect_file_type(unsupported)
