"""Tests for CLI invocation and FastAPI endpoints."""
from pathlib import Path
import subprocess
import sys
from fastapi.testclient import TestClient

from cor_engine.api import app


client = TestClient(app)


def test_api_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["engine"] == "COR"
    assert data["status"] in ("healthy", "degraded")
    assert "ocr_available" in data


def test_api_capabilities():
    response = client.get("/capabilities")
    assert response.status_code == 200
    data = response.json()
    assert data["engine_id"] == "COR"
    assert "pdf" in data["supported_formats"]
    assert data["ocr_engine"] == "PaddleOCR"


def test_api_extract_upload(txt_file):
    with open(txt_file, "rb") as f:
        response = client.post(
            "/extract",
            files={"file": (txt_file.name, f, "text/plain")},
            data={"document_id": "api_test_doc"}
        )

    assert response.status_code == 200
    data = response.json()
    assert data["engine_id"] == "COR"
    assert data["status"] == "success"
    assert data["document_id"] == "api_test_doc"
    assert data["raw_file_id"] == "api_test_doc.txt"
    assert data["page_count"] == 1
    assert data["character_count"] > 50


def test_api_extract_path(txt_file):
    response = client.post(
        "/extract/path",
        json={"file_path": str(txt_file), "document_id": "path_test_doc"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["engine_id"] == "COR"
    assert data["status"] == "success"
    assert data["document_id"] == "path_test_doc"


def test_cli_execution(txt_file, test_output_dir):
    """Test CLI subprocess execution using `python -m cor_engine.extract`."""
    cmd = [
        sys.executable,
        "-m",
        "cor_engine.extract",
        "--input",
        str(txt_file),
        "--doc-id",
        "cli_test_doc",
        "--output-dir",
        str(test_output_dir),
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert res.returncode == 0
    stdout = res.stdout

    # Verify concise metadata printed per Section 25
    assert "COR EXTRACTION COMPLETE" in stdout
    assert "Engine:" in stdout
    assert "COR" in stdout
    assert "Status:" in stdout
    assert "SUCCESS" in stdout
    assert "Artifact:" in stdout
    assert "cli_test_doc.txt" in stdout
    assert "Characters:" in stdout
    assert "Processing time:" in stdout

    # Verify saved file exists
    saved_txt = test_output_dir / "cli_test_doc.txt"
    assert saved_txt.exists()

