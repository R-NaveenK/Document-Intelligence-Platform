from app.engine import StructuringEngine

def test_category13_certificate_document():
    engine = StructuringEngine()
    
    cert_text = (
        "CERTIFICATE OF COMPLETION\n"
        "Candidate Name: Rahul Kumar\n"
        "Certificate No: CERT-2026-045\n"
        "Issue Date: 15-08-2026\n"
        "Course: Advanced Python Programming"
    )
    
    req = "Give me candidate name, certificate number and issue date."
    response = engine.structure(raw_extraction=cert_text, user_request=req)
    
    assert response.status in ["success", "partial_success"]
    data = response.structured_data
    assert data["customer_name"] == "Rahul Kumar"
    assert data["certificate_number"] == "CERT-2026-045"
    assert data["invoice_date"] == "15-08-2026"

def test_category13_store_receipt_document():
    engine = StructuringEngine()
    
    receipt_text = (
        "STORE RECEIPT\n"
        "Merchant: XYZ MART\n"
        "Date: 01-09-2026\n"
        "Receipt No: RCP-4582\n"
        "Total: ₹2,450.00\n"
        "Payment: UPI"
    )
    
    req = "Give me merchant, receipt number, date and total."
    response = engine.structure(raw_extraction=receipt_text, user_request=req)
    
    assert response.status in ["success", "partial_success"]
    data = response.structured_data
    assert data["seller_name"] == "XYZ MART"
    assert data["invoice_number"] == "RCP-4582"
    assert data["invoice_date"] == "01-09-2026"
    assert "2,450.00" in str(data["total_amount"])
