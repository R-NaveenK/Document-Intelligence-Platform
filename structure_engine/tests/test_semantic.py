"""
Comprehensive Test Suite for Semantic Field Understanding & Field Mapping Engine.
Covers conceptual matching, unseen expressions, contextual disambiguation, negative evidence,
adversarial discrimination, user-defined dynamic schemas, and all 8 Section 26 Acceptance Tests.
"""

import pytest
from app.engine import StructuringEngine
from app.semantic.representation import SemanticConceptSpace
from app.semantic.matcher import SemanticFieldMatcher

@pytest.fixture
def engine():
    return StructuringEngine()

def test_acceptance_test_1_invoice_number_synonym(engine):
    """TEST 1: invoice_number -> Bill No: INV-2026-0098"""
    raw = "TAX INVOICE\nBill No: INV-2026-0098\nDate: 02-09-2026"
    res = engine.structure(raw_extraction=raw, user_request="Extract invoice_number")
    assert res.structured_data.get("invoice_number") == "INV-2026-0098"
    assert res.field_status.get("invoice_number") == "found"

def test_acceptance_test_2_total_amount_grand_total(engine):
    """TEST 2: total_amount -> Grand Total: ₹48,500.00"""
    raw = "TAX INVOICE\nSubtotal: 40,000.00\nTax: 8,500.00\nGrand Total: ₹48,500.00"
    res = engine.structure(raw_extraction=raw, user_request="Extract total_amount")
    assert "48,500.00" in res.structured_data.get("total_amount")
    assert res.field_status.get("total_amount") == "found"

def test_acceptance_test_3_customer_context_disambiguation(engine):
    """TEST 3: customer_name -> Seller: TECHSOLUTIONS vs Bill To: ABC INDUSTRIES LTD"""
    raw = "TAX INVOICE\nSeller: TECHSOLUTIONS PVT LTD\nBill To: ABC INDUSTRIES LTD\nAmount: 500.00"
    res = engine.structure(raw_extraction=raw, user_request="Extract customer_name")
    assert res.structured_data.get("customer_name") == "ABC INDUSTRIES LTD"
    assert res.structured_data.get("customer_name") != "TECHSOLUTIONS PVT LTD"

def test_acceptance_test_4_adversarial_invoice_vs_po_vs_ref(engine):
    """TEST 4: invoice_number vs PO Number vs Reference No"""
    raw = """
    Invoice No: INV-1234
    PO Number: PO-5678
    Reference No: REF-9999
    """
    res = engine.structure(raw_extraction=raw, user_request="Extract invoice_number")
    assert res.structured_data.get("invoice_number") == "INV-1234"
    assert res.field_status.get("invoice_number") == "found"

def test_acceptance_test_5_missing_pan_no_hallucination(engine):
    """TEST 5: Target PAN, Raw has no PAN info -> null / not_found"""
    raw = "STORE RECEIPT\nDate: 01-09-2026\nTotal: 150.00\nPayment: Cash"
    res = engine.structure(raw_extraction=raw, user_request="Extract PAN")
    assert res.structured_data.get("pan_number") is None
    assert res.field_status.get("pan_number") == "not_found"

def test_acceptance_test_6_unseen_billing_reference(engine):
    """TEST 6: Target 'billing reference' -> Bill No: INV-2026-0098"""
    raw = "TAX INVOICE\nBill No: INV-2026-0098\nDate: 02-09-2026"
    schema = [{"name": "billing_reference", "type": "string"}]
    res = engine.structure(raw_extraction=raw, user_schema=schema)
    assert res.structured_data.get("billing_reference") == "INV-2026-0098"
    assert res.field_status.get("billing_reference") == "found"

def test_acceptance_test_7_unseen_amount_payable(engine):
    """TEST 7: Target 'amount payable' -> Grand Total: ₹48,500.00"""
    raw = "STATEMENT\nSubtotal: 40,000.00\nGrand Total: ₹48,500.00"
    schema = [{"name": "amount_payable", "type": "currency"}]
    res = engine.structure(raw_extraction=raw, user_schema=schema)
    assert "48,500.00" in res.structured_data.get("amount_payable")
    assert res.field_status.get("amount_payable") == "found"

def test_acceptance_test_8_unseen_buyer_organization(engine):
    """TEST 8: Target 'buyer organization' -> Seller: TECHSOLUTIONS vs Bill To: ABC INDUSTRIES LTD"""
    raw = "COMMERCIAL INVOICE\nSeller: TECHSOLUTIONS PVT LTD\nBill To: ABC INDUSTRIES LTD\nDate: 01-09-2026"
    schema = [{"name": "buyer_organization", "type": "string"}]
    res = engine.structure(raw_extraction=raw, user_schema=schema)
    assert res.structured_data.get("buyer_organization") == "ABC INDUSTRIES LTD"
    assert res.field_status.get("buyer_organization") == "found"

def test_dynamic_user_defined_schema_multiple_unseen(engine):
    """Tests an external dynamic schema with unseen fields completely outside predefined aliases."""
    raw = """
    PURCHASE ORDER
    Vendor: Apex Industrial Supplies Ltd
    Order Reference: PO-GL-2026-9921
    Order Date: 28-08-2026
    Total PO Value: 162000.00
    """
    user_schema = [
        {"name": "order_reference", "type": "identifier", "description": "PO tracking ID"},
        {"name": "order_date", "type": "date", "description": "Date of order issue"},
        {"name": "total_po_value", "type": "currency", "description": "Total order amount"}
    ]
    res = engine.structure(raw_extraction=raw, user_schema=user_schema)
    assert res.status == "success"
    assert res.structured_data.get("order_reference") == "PO-GL-2026-9921"
    assert res.structured_data.get("order_date") == "28-08-2026"
    assert "162000.00" in res.structured_data.get("total_po_value")

def test_document_generalization_receipt_and_certificate(engine):
    """Tests receipt and certificate document types."""
    receipt_text = "STORE RECEIPT\nReceipt ID: RCP-1234\nDate: 01-09-2026\nTotal: 250.00"
    schema_rcp = [{"name": "receipt_number", "type": "identifier"}]
    res_rcp = engine.structure(raw_extraction=receipt_text, user_schema=schema_rcp)
    assert res_rcp.structured_data.get("receipt_number") == "RCP-1234"

    cert_text = "CERTIFICATE OF MERIT\nCertificate ID: CERT-55\nIssued: 15-08-2026"
    schema_cert = [{"name": "certificate_number", "type": "identifier"}]
    res_cert = engine.structure(raw_extraction=cert_text, user_schema=schema_cert)
    assert res_cert.structured_data.get("certificate_number") == "CERT-55"
