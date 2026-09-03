from app.engine import StructuringEngine
from app.models.structuring_output import StructuringResponse

def test_category15_output_schema_compliance(sample_invoice_input):
    engine = StructuringEngine()
    
    req = "Extract invoice number, customer name, total amount and non_existent_field."
    response = engine.structure(sample_invoice_input, req)
    
    # Must be valid StructuringResponse instance
    assert isinstance(response, StructuringResponse)
    
    # Check JSON serializability
    json_payload = response.model_dump_json()
    assert isinstance(json_payload, str)
    
    data = response.structured_data
    # Correct field types
    assert isinstance(data["invoice_number"], str)
    assert isinstance(data["customer_name"], str)
    assert data["non_existent_field"] is None
    
    # Correct status types
    assert response.field_status["invoice_number"] == "found"
    assert response.field_status["non_existent_field"] == "not_found"
