import os
import pytest
from fastapi.testclient import TestClient
from run import app

client = TestClient(app)
SAMPLE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents")

def test_api_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["engine_id"] == "engine_1"

def test_api_version_endpoint():
    response = client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert data["engine_id"] == "engine_1"
    assert "version" in data

def test_api_extract_endpoint():
    pdf_path = os.path.join(SAMPLE_DIR, "digital_invoice_1.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Digital invoice PDF missing.")

    with open(pdf_path, "rb") as f:
        response = client.post(
            "/extract",
            files={"file": ("digital_invoice_1.pdf", f, "application/pdf")},
            data={"document_id": "DOC-TEST-100"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["engine_id"] == "engine_1"
    assert data["status"] == "success"
    assert "ABC TECHNOLOGIES" in data["raw_text"]
    assert data["pages_processed"] == 1
    assert data["document_id"] == "DOC-TEST-100"
    assert data["raw_file_id"] == "DOC-TEST-100.txt"
    assert data["raw_file_path"] is not None
    assert os.path.exists(data["raw_file_path"])


def test_api_extract_invalid_document_id_returns_400():
    pdf_path = os.path.join(SAMPLE_DIR, "digital_invoice_1.pdf")
    if not os.path.exists(pdf_path):
        pytest.skip("Digital invoice PDF missing.")

    with open(pdf_path, "rb") as f:
        response = client.post(
            "/extract",
            files={"file": ("digital_invoice_1.pdf", f, "application/pdf")},
            data={"document_id": "../../bad_id"}
        )

    assert response.status_code == 400
    assert "Invalid document_id" in response.json()["detail"]
