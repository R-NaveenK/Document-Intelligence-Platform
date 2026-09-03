"""Tests for PDF extraction handler (digital, scanned, mixed, multi-page)."""
from pathlib import Path
from cor_engine.extractor import CorExtractor
from cor_engine.models import ExtractionStatus


def test_digital_pdf_extraction(digital_pdf_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(digital_pdf_file, document_id="digital_pdf")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type == "PDF"
    assert result.page_count == 1
    assert result.character_count > 50
    assert result.extraction_confidence == 1.0

    # Verify page demarcation format
    assert "PAGE 1" in result.raw_text
    assert "TAX INVOICE" in result.raw_text
    assert "TSPL/INV/2026-27/0897" in result.raw_text
    assert "Rs. 456,660" in result.raw_text


def test_scanned_pdf_extraction(scanned_pdf_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(scanned_pdf_file, document_id="scanned_pdf")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type == "PDF"
    assert result.page_count == 1
    assert result.character_count > 30
    assert result.extraction_confidence is not None

    # Check page demarcation and OCR contents
    assert "PAGE 1" in result.raw_text
    assert "INVOICE" in result.raw_text or "TAX" in result.raw_text


def test_mixed_pdf_extraction(mixed_pdf_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(mixed_pdf_file, document_id="mixed_pdf")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type == "PDF"
    assert result.page_count == 2

    # Check both page boundaries are clearly preserved
    assert "PAGE 1" in result.raw_text
    assert "PAGE 2" in result.raw_text
    assert "PAGE 1: SUMMARY" in result.raw_text


def test_multipage_pdf_boundaries(multipage_pdf_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(multipage_pdf_file, document_id="multipage_pdf")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.page_count == 3

    assert "PAGE 1" in result.raw_text
    assert "PAGE 2" in result.raw_text
    assert "PAGE 3" in result.raw_text
    assert "Section 1 Content" in result.raw_text
    assert "Section 2 Content" in result.raw_text
    assert "Section 3 Content" in result.raw_text
