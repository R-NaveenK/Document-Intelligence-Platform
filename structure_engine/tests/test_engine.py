import pytest
from app.engine import StructuringEngine
from app.core.exceptions import InvalidInputError

def test_engine_invoice_structuring(sample_invoice_input):
    engine = StructuringEngine()
    req = "I need the invoice number, customer name, customer GSTIN and total amount."
    
    response = engine.structure(sample_invoice_input, req)
    
    assert response.status == "success"
    assert response.document_id == "DOC-SAMPLE-INV-0897"
    assert response.structured_data["invoice_number"] == "TSPL/INV/2026-27/0897"
    assert response.structured_data["customer_name"] == "ABC INDUSTRIES LTD."
    assert response.structured_data["customer_gstin"] == "27AABCU9638R1Z2"
    assert "4,89,075.00" in str(response.structured_data["total_amount"])

def test_engine_non_invoice_document():
    engine = StructuringEngine()
    medical_text = (
        "APEX DIAGNOSTICS LAB\n"
        "102 Health Avenue, New Delhi\n"
        "Patient Name: John Doe\n"
        "Test Date: 15/08/2026\n"
        "Serum Cholesterol: 210 mg/dL\n"
        "Triglycerides: 150 mg/dL"
    )
    req = "Extract patient name, test date, lab name and cholesterol level."
    
    response = engine.structure(raw_extraction=medical_text, user_request=req, document_id="MED-101")
    
    assert response.status == "success"
    assert response.document_id == "MED-101"
    assert response.structured_data["customer_name"] == "John Doe"  # patient maps to customer_name key
    assert response.structured_data["invoice_date"] == "15/08/2026"
    assert response.structured_data["seller_name"] == "APEX DIAGNOSTICS LAB"

def test_engine_invalid_input():
    engine = StructuringEngine()
    with pytest.raises(InvalidInputError):
        engine.structure(raw_extraction="sample text", user_request="")
