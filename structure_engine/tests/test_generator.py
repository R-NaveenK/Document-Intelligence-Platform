from app.request_parser.parser import RequestParser
from app.schema_builder.builder import SchemaBuilder
from app.models.structuring_output import FieldExtractionResult
from app.output_generator.generator import StructuredOutputGenerator

def test_structured_output_generator():
    parser = RequestParser()
    builder = SchemaBuilder()
    generator = StructuredOutputGenerator()
    
    parsed = parser.parse("Extract invoice number and customer name")
    schema_cls = builder.build_pydantic_model(parsed)
    
    extracted_fields = {
        "invoice_number": FieldExtractionResult(field="invoice_number", value="INV-999", status="found", confidence=0.95),
        "customer_name": FieldExtractionResult(field="customer_name", value="Acme Corp", status="found", confidence=0.90)
    }
    
    instance = generator.generate(extracted_fields, schema_cls)
    dict_data = instance.model_dump()
    assert dict_data["invoice_number"] == "INV-999"
    assert dict_data["customer_name"] == "Acme Corp"
