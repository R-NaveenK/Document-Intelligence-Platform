"""Tests for plain text (TXT) extraction handler."""
from pathlib import Path
from cor_engine.extractor import CorExtractor
from cor_engine.models import ExtractionStatus


def test_txt_standard_extraction(txt_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(txt_file, document_id="invoice_plain")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.engine_id == "COR"
    assert result.document_id == "invoice_plain"
    assert result.file_type == "TXT"
    assert result.page_count == 1
    assert result.character_count > 100
    assert result.extraction_confidence == 1.0

    # Verify saved artifact
    assert result.raw_file_path is not None
    out_file = Path(result.raw_file_path)
    assert out_file.exists()
    content = out_file.read_text(encoding="utf-8")
    assert "TAX INVOICE" in content
    assert "TSPL/INV/2026-27/0897" in content
    assert "Rs. 456,660" in content


def test_txt_unicode_and_currency_symbols(tmp_path, test_output_dir):
    p = tmp_path / "unicode_currency.txt"
    test_text = (
        "INVOICE & MULTILINGUAL SUMMARY\n"
        "Customer: José García & Société Générale\n"
        "Branch: नई दिल्ली, भारत (New Delhi, India)\n"
        "Currencies: $ 1,500.00 | € 2,450.50 | £ 890.25 | ¥ 150,000 | ₹ 75,000.00\n"
        "Tax Rate: 18.5%\n"
    )
    p.write_text(test_text, encoding="utf-8")

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="unicode_doc")

    assert result.status == ExtractionStatus.SUCCESS
    out_file = Path(result.raw_file_path)
    extracted = out_file.read_text(encoding="utf-8")

    # Verify Unicode and currency characters preserved without distortion
    assert "José García" in extracted
    assert "नई दिल्ली" in extracted
    assert "$" in extracted
    assert "€" in extracted
    assert "£" in extracted
    assert "¥" in extracted
    assert "₹" in extracted
    assert "18.5%" in extracted


def test_txt_latin1_encoding(tmp_path, test_output_dir):
    p = tmp_path / "latin1_doc.txt"
    latin1_text = "Faktur No: 98765\nMontant: 450 €\nSociété: Müller & Associés\n"
    p.write_bytes(latin1_text.encode("latin-1", errors="ignore"))

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="latin1_doc")

    assert result.status == ExtractionStatus.SUCCESS
    assert "98765" in result.raw_text


def test_txt_empty_document(tmp_path, test_output_dir):
    p = tmp_path / "empty.txt"
    p.write_text("", encoding="utf-8")

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="empty_doc")

    assert result.status == ExtractionStatus.FAILED
    assert result.error_code is not None

