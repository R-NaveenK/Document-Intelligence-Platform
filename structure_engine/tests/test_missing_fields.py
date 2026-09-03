from app.engine import StructuringEngine

def test_category6_missing_field_no_hallucination(sample_invoice_input):
    engine = StructuringEngine()
    
    req = "Give me invoice number, PAN number and customer email."
    response = engine.structure(sample_invoice_input, req)
    
    data = response.structured_data
    assert data["invoice_number"] == "TSPL/INV/2026-27/0897"
    assert data["pan_number"] is None
    assert data["email"] is None
    
    assert response.field_status["invoice_number"] == "found"
    assert response.field_status["pan_number"] == "not_found"
    assert response.field_status["email"] == "not_found"
    assert response.summary.found_count >= 1
    assert response.summary.not_found_count >= 1

def test_category9_selective_extraction(sample_invoice_input):
    engine = StructuringEngine()
    
    req = "Give me only the invoice number and total amount."
    response = engine.structure(sample_invoice_input, req)
    
    data = response.structured_data
    assert set(data.keys()) == {"invoice_number", "total_amount"}
    assert data["invoice_number"] == "TSPL/INV/2026-27/0897"
    assert "4,89,075.00" in data["total_amount"] or "489075" in data["total_amount"].replace(',', '')
    
    assert "products" not in data
    assert "customer_gstin" not in data
    assert "bank_details" not in data
