"""Tests for image extraction handler using PaddleOCR."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from cor_engine.extractor import CorExtractor
from cor_engine.models import ExtractionStatus


def test_png_extraction(png_image_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(png_image_file, document_id="invoice_png")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.engine_id == "COR"
    assert result.file_type == "PNG"
    assert result.page_count == 1
    assert result.character_count > 30
    assert result.extraction_confidence is not None
    assert result.extraction_confidence > 0.5

    # Check saved text file
    out_file = Path(result.raw_file_path)
    assert out_file.exists()
    content = out_file.read_text(encoding="utf-8")

    # Important text and numerical details should be extracted
    assert "TAX INVOICE" in content or "INVOICE" in content
    assert "TECHSOLUTIONS" in content or "SOLUTIONS" in content
    assert "29AABCT1234Q1Z5" in content or "GSTIN" in content


def test_jpg_extraction(jpg_image_file, test_output_dir):
    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(jpg_image_file, document_id="invoice_jpg")

    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type in ("JPG", "JPEG")
    assert result.page_count == 1
    assert result.character_count > 30
    assert result.extraction_confidence is not None
    assert result.extraction_confidence > 0.5


def test_noisy_low_contrast_image(tmp_path, test_output_dir):
    """Test image with noise and low contrast."""
    p = tmp_path / "noisy_scan.png"
    img = Image.new("RGB", (600, 200), color=(220, 220, 220))
    draw = ImageDraw.Draw(img)
    draw.text((20, 50), "PO NUMBER: PO-998822", fill=(60, 60, 60))
    draw.text((20, 90), "AMOUNT DUE: Rs. 14,500.00", fill=(70, 70, 70))

    # Add subtle random noise
    arr = np.array(img)
    noise = np.random.randint(-15, 15, arr.shape, dtype=np.int16)
    noisy_arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    Image.fromarray(noisy_arr).save(p)

    extractor = CorExtractor(output_dir=test_output_dir)
    result = extractor.extract(p, document_id="noisy_scan")

    assert result.status == ExtractionStatus.SUCCESS
    assert "PO-998822" in result.raw_text or "998822" in result.raw_text
