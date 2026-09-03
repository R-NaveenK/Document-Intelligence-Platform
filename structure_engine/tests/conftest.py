import pytest
import json
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.engine import StructuringEngine
from app.models.extraction_input import RawExtractionInput

@pytest.fixture
def sample_invoice_raw_dict():
    sample_path = Path(__file__).parent.parent / "sample_data" / "sample_invoice_extraction.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        return json.load(f)

@pytest.fixture
def sample_invoice_input(sample_invoice_raw_dict):
    return RawExtractionInput(**sample_invoice_raw_dict)

@pytest.fixture
def engine():
    return StructuringEngine()

@pytest.fixture
def api_client():
    return TestClient(app)
