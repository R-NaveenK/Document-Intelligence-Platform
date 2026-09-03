from app.engine import StructuringEngine
from app.models.extraction_input import RawExtractionInput, PageInput

def test_full_pipeline_extraction_to_structuring_integration():
    """
    Simulates the integration contract:
    1. Upstream Extraction Engine produces raw text & page markers.
    2. Comparison Engine selects best raw extraction output.
    3. Structuring Layer receives raw extraction + user natural language request.
    4. Structuring Layer returns validated structured response payload.
    """
    # 1. Simulated Extraction Engine output
    mock_upstream_extraction = RawExtractionInput(
        document_id="DOC-INTEG-2026-001",
        raw_text=(
            "TAX INVOICE\n"
            "GLOBAL LOGISTICS SOLUTIONS LTD.\n"
            "Invoice No: GLS/2026/9821\n"
            "Invoice Date: 12-05-2026\n"
            "[PAGE_BREAK]\n"
            "BILLED TO:\n"
            "OMEGA ENTERPRISES PVT LTD\n"
            "Customer GSTIN: 33AAACU1234D1Z5\n"
            "Total Amount Payable: ₹1,25,000.00"
        ),
        pages=[
            PageInput(page_number=1, raw_text="TAX INVOICE...", confidence=0.99),
            PageInput(page_number=2, raw_text="BILLED TO...", confidence=0.98)
        ],
        extraction_confidence=0.985,
        metadata={"source_engine": "paddleocr_engine_1"}
    )
    
    # 2. Natural language user request
    user_request = "I need invoice number, invoice date, customer name, customer GSTIN, total amount and pan number."
    
    # 3. Invoke Structuring Layer Engine
    engine = StructuringEngine()
    response = engine.structure(
        raw_extraction=mock_upstream_extraction,
        user_request=user_request
    )
    
    # 4. Verify complete output payload integrity
    assert response.status == "partial_success"  # Because pan_number is missing in doc!
    assert response.document_id == "DOC-INTEG-2026-001"
    
    data = response.structured_data
    assert data["invoice_number"] == "GLS/2026/9821"
    assert data["invoice_date"] == "12-05-2026"
    assert data["customer_name"] == "OMEGA ENTERPRISES PVT LTD"
    assert data["customer_gstin"] == "33AAACU1234D1Z5"
    assert "1,25,000.00" in str(data["total_amount"])
    
    # Verify strict no-hallucination requirement for pan_number
    assert data["pan_number"] is None
    assert response.field_status["pan_number"] == "not_found"
    assert response.field_status["invoice_number"] == "found"
    
    # Verify execution metrics
    assert response.summary.total_requested == 6
    assert response.summary.found_count == 5
    assert response.summary.not_found_count == 1
    assert response.processing_time_ms > 0.0
