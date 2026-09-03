from app.request_parser.parser import RequestParser
from app.schema_builder.builder import SchemaBuilder
from app.models.structuring_output import FieldExtractionResult
from app.formatter.formatter import OutputFormatter

def test_output_formatter():
    parser = RequestParser()
    builder = SchemaBuilder()
    formatter = OutputFormatter()
    
    parsed = parser.parse("Extract invoice number and pan number")
    schema_cls = builder.build_pydantic_model(parsed)
    schema_inst = schema_cls(invoice_number="INV-100", pan_number=None)
    
    extracted = {
        "invoice_number": FieldExtractionResult(field="invoice_number", value="INV-100", status="found", confidence=0.95),
        "pan_number": FieldExtractionResult(field="pan_number", value=None, status="not_found", confidence=0.0)
    }
    
    res = formatter.format_response(
        document_id="DOC-123",
        structured_data_model=schema_inst,
        field_extraction_results=extracted,
        processing_time_ms=45.2
    )
    
    assert res.status == "partial_success"
    assert res.document_id == "DOC-123"
    assert res.summary.total_requested == 2
    assert res.summary.found_count == 1
    assert res.summary.not_found_count == 1
    assert res.field_status["invoice_number"] == "found"
    assert res.field_status["pan_number"] == "not_found"
