import os
import pytest
from app.pdf.pdf_handler import PDFHandler
from app.core.exceptions import CorruptedFileError

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_pdf_handler_digital_pdf():
    pdf_path = os.path.join(SAMPLE_DIR, "digital_invoice_1.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Sample digital PDF not found.")

    pages = PDFHandler.process_pdf(pdf_path)
    assert len(pages) == 1
    assert pages[0]["page_number"] == 1
    assert pages[0]["has_digital_text"] is True
    assert "ABC TECHNOLOGIES" in pages[0]["digital_text"]

def test_pdf_handler_multipage():
    pdf_path = os.path.join(SAMPLE_DIR, "multipage_invoice.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Sample multipage PDF not found.")

    count = PDFHandler.get_page_count(pdf_path)
    assert count == 2

    pages = PDFHandler.process_pdf(pdf_path)
    assert len(pages) == 2
    assert "PAGE 1" in pages[0]["digital_text"]
    assert "PAGE 2" in pages[1]["digital_text"]

def test_pdf_handler_corrupted_pdf():
    corrupt_path = os.path.join(SAMPLE_DIR, "corrupted_doc.pdf")
    if not os.path.exists(corrupt_path):
        pytest.skip("Sample corrupted PDF not found.")

    with pytest.raises(CorruptedFileError):
        PDFHandler.get_page_count(corrupt_path)
