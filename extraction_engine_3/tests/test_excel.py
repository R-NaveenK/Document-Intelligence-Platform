import os
import pytest
from app.engine import ExtractionEngine
from app.excel.excel_handler import ExcelHandler
from app.models.extraction_result import ExtractionResult, ExtractionStatus

SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_excel_handler_processing():
    excel_path = os.path.join(SAMPLE_DIR, "sample_invoice.xlsx")
    if not os.path.exists(excel_path):
        pytest.skip("sample_invoice.xlsx missing.")

    sheets = ExcelHandler.process_excel(excel_path)
    assert len(sheets) == 1
    assert sheets[0]["sheet_name"] == "InvoiceData"
    assert "TSPL/INV/2026/001" in sheets[0]["raw_text"]
    assert "456660" in sheets[0]["raw_text"]

def test_engine_extract_excel_document():
    excel_path = os.path.join(SAMPLE_DIR, "sample_invoice.xlsx")
    if not os.path.exists(excel_path):
        pytest.skip("sample_invoice.xlsx missing.")

    engine = ExtractionEngine()
    result = engine.extract(excel_path, original_filename="sample_invoice.xlsx")

    assert isinstance(result, ExtractionResult)
    assert result.status == ExtractionStatus.SUCCESS
    assert result.file_type in ["xlsx", "xls"]
    assert "TechSolutions Pvt. Ltd." in result.raw_text
    assert "Laptop 5440" in result.raw_text
    assert "456660" in result.raw_text
