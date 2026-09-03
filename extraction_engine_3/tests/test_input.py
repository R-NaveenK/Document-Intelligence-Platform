import os
import pytest
from app.input.input_handler import InputHandler
from app.input.file_detector import FileDetector
from app.core.exceptions import InvalidInputError, UnsupportedFileError

def test_input_handler_empty_file(tmp_path):
    empty_file = tmp_path / "empty.txt"
    empty_file.write_bytes(b"")
    
    handler = InputHandler(temp_dir=str(tmp_path))
    with pytest.raises(InvalidInputError):
        handler.process_input(str(empty_file))

def test_input_handler_unsupported_format(tmp_path):
    unsupported_file = tmp_path / "document.xyz"
    unsupported_file.write_bytes(b"SOME_UNSUPPORTED_HEADER_DATA_1234567890")
    
    handler = InputHandler(temp_dir=str(tmp_path))
    with pytest.raises(UnsupportedFileError):
        handler.process_input(str(unsupported_file))

def test_input_handler_bytes_input(tmp_path):
    sample_bytes = b"ABC TECHNOLOGIES INVOICE CONTENT SAMPLE"
    handler = InputHandler(temp_dir=str(tmp_path))
    
    working_path, mime_type, extension, is_temp = handler.process_input(
        sample_bytes, original_filename="test.png"
    )
    assert os.path.exists(working_path)
    assert is_temp is True
    handler.cleanup(working_path)
    assert not os.path.exists(working_path)

def test_file_detector_magic_bytes(tmp_path):
    pdf_file = tmp_path / "sample.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 header contents")
    
    mime, ext = FileDetector.detect_file_type(str(pdf_file))
    assert mime == "application/pdf"
    assert ext == "pdf"
