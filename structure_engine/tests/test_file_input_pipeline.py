import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.engine import StructuringEngine
from app.core.exceptions import RawArtifactNotFoundError

@pytest.fixture
def engine():
    return StructuringEngine()

@pytest.fixture
def client():
    return TestClient(app)

def test_pipeline_file_semantic_test_a_and_b(engine):
    """
    SEMANTIC TEST A: invoice_number from Bill No.: NDS/SEP/26/0734
    SEMANTIC TEST B: total_amount from Final settlement value: Rs. 4,12,941
    """
    res = engine.structure(
        document_id="doc_20260903_001",
        user_request="Extract invoice number and total amount"
    )
    assert res.status == "success"
    assert res.structured_data["invoice_number"] == "NDS/SEP/26/0734"
    assert "4,12,941" in res.structured_data["total_amount"]
    assert res.field_status["invoice_number"] == "found"
    assert res.field_status["total_amount"] == "found"

def test_pipeline_file_semantic_test_c_and_f(engine):
    """
    SEMANTIC TEST C: buyer_organization from Billed Party: GREENFIELD AUTOMATION LTD.
    SEMANTIC TEST F: items list from multi-line delivered items
    """
    res = engine.structure(
        document_id="doc_20260903_001",
        user_request="Extract buyer organization and items table"
    )
    assert res.status == "success"
    assert res.structured_data["customer_name"] == "GREENFIELD AUTOMATION LTD."
    items = res.structured_data.get("items")
    assert isinstance(items, list)
    assert len(items) == 2
    dell_item = next(i for i in items if "Dell" in i["name"])
    assert dell_item["quantity"] == 3.0
    assert "72,000" in dell_item["unit_price"]

def test_pipeline_file_semantic_test_d_and_negative_case(engine):
    """
    SEMANTIC TEST D:
    Target 'billing_reference' maps 'Transaction identifier: AOS-78421'
    Target 'invoice_number' returns null/not_found because Transaction Identifier != Invoice Number
    """
    raw_doc = (
        "Transaction identifier: AOS-78421\n"
        "Supplier: ARCADIA OFFICE SYSTEMS\n"
        "Purchaser: ZENITH CONSULTING SERVICES"
    )
    
    # 1. Billing reference matches
    res1 = engine.structure(raw_extraction=raw_doc, user_request="Extract billing reference")
    assert res1.structured_data["billing_reference"] == "AOS-78421"
    assert res1.field_status["billing_reference"] == "found"

    # 2. Negative case: invoice number must NOT force a false match
    res2 = engine.structure(raw_extraction=raw_doc, user_request="Extract invoice number")
    assert res2.structured_data["invoice_number"] is None
    assert res2.field_status["invoice_number"] == "not_found"

def test_pipeline_file_semantic_test_e_missing_pan(engine):
    """
    SEMANTIC TEST E: pan_number is missing in document -> returns null/not_found without hallucinating.
    """
    res = engine.structure(
        document_id="doc_20260903_001",
        user_request="Extract pan number"
    )
    assert res.structured_data["pan_number"] is None
    assert res.field_status["pan_number"] == "not_found"

def test_pipeline_large_50page_document(engine):
    """Tests structuring of a large 50-page raw text document."""
    res = engine.structure(
        document_id="doc_large_50page",
        user_request="Extract invoice number, total amount, customer name, vendor name"
    )
    assert res.status == "success"
    assert res.structured_data["invoice_number"] == "MIGS/2026/89431"
    assert res.structured_data["customer_name"] == "ZENITH INFOTECH ENTERPRISES LTD"
    assert "15,75,000" in res.structured_data["total_amount"]
    assert res.summary.found_count == 4

def test_pipeline_prompt_injection_safety(engine):
    """Tests prompt injection commands inside document are ignored."""
    res = engine.structure(
        document_id="doc_injection",
        user_request="Extract invoice number, total amount, customer name, seller name"
    )
    assert res.status == "success"
    assert res.structured_data["invoice_number"] == "INV-SEC-2026-99"
    assert res.structured_data["customer_name"] == "Acme Corporation"
    assert "1180.00" in res.structured_data["total_amount"]
    assert "Ignore" not in str(res.structured_data)

def test_pipeline_unicode_document(engine):
    """Tests multi-currency and unicode language document extraction."""
    res = engine.structure(
        document_id="doc_unicode",
        user_request="Extract invoice number and total amount"
    )
    assert res.status == "success"
    assert res.structured_data["invoice_number"] == "FR-2026-88741"
    assert "14,940.60" in res.structured_data["total_amount"]

def test_pipeline_noisy_ocr_document(engine):
    """Tests resilient extraction from noisy OCR text."""
    res = engine.structure(
        document_id="doc_noisy_ocr",
        user_request="Extract invoice number and total amount"
    )
    assert res.status == "success"
    assert res.structured_data["invoice_number"] == "N015Y-0CR-9921"
    assert "98,500.00" in res.structured_data["total_amount"]

def test_pipeline_dynamic_schema_file_input(engine):
    """Tests dynamic user-defined schema input with document_id."""
    schema = [
        {"name": "bill_no", "type": "identifier", "description": "Bill ID"},
        {"name": "settlement_value", "type": "currency", "description": "Final settlement amount"}
    ]
    res = engine.structure(document_id="doc_20260903_001", user_schema=schema)
    assert res.status == "success"
    assert res.structured_data["bill_no"] == "NDS/SEP/26/0734"
    assert "4,12,941" in res.structured_data["settlement_value"]

def test_api_structure_endpoint_with_document_id(client):
    """Tests the /structure REST endpoint receiving document_id."""
    payload = {
        "document_id": "doc_20260903_001",
        "user_request": "Extract invoice number and total amount"
    }
    response = client.post("/structure", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["structured_data"]["invoice_number"] == "NDS/SEP/26/0734"
    assert "4,12,941" in data["structured_data"]["total_amount"]

def test_api_structure_endpoint_with_schema_field_list(client):
    """Tests the /structure REST endpoint receiving document_id and schema."""
    payload = {
        "document_id": "doc_20260903_001",
        "schema": {
            "fields": ["billing_reference", "amount_payable", "buyer_organization"]
        }
    }
    response = client.post("/structure", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["structured_data"]["billing_reference"] == "NDS/SEP/26/0734"
    assert "4,12,941" in data["structured_data"]["amount_payable"]
    assert data["structured_data"]["buyer_organization"] == "GREENFIELD AUTOMATION LTD."

def test_api_structure_endpoint_missing_document_404(client):
    """Tests 404 response when document_id artifact is missing."""
    payload = {
        "document_id": "non_existent_doc_88219",
        "user_request": "Extract invoice number"
    }
    response = client.post("/structure", json=payload)
    assert response.status_code == 404
    err = response.json()
    assert err["detail"]["error_code"] == "RAW_ARTIFACT_NOT_FOUND"

def test_api_structure_endpoint_path_traversal_403(client):
    """Tests 403 response when path traversal is attempted."""
    payload = {
        "document_id": "../etc/passwd",
        "user_request": "Extract invoice number"
    }
    response = client.post("/structure", json=payload)
    assert response.status_code == 403
    err = response.json()
    assert err["detail"]["error_code"] == "SECURITY_PATH_TRAVERSAL_ERROR"
