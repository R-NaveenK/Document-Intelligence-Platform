from app.request_parser.parser import RequestParser
from app.schema_builder.builder import SchemaBuilder

def test_schema_builder_category2_scalars_and_lists():
    parser = RequestParser()
    builder = SchemaBuilder()
    
    # Single scalar field
    p1 = parser.parse("Give me the invoice number.")
    model1 = builder.build_pydantic_model(p1)
    assert "invoice_number" in model1.model_fields
    
    # Multiple scalar fields
    p2 = parser.parse("Give me invoice number, customer name, GSTIN and total amount.")
    model2 = builder.build_pydantic_model(p2)
    assert len(model2.model_fields) == 4
    
    # Repeating object list with custom fields: name, HSN code, quantity, unit price, amount
    req_list = "Give me all products with name, HSN code, quantity, unit price and amount."
    p3 = parser.parse(req_list)
    model3 = builder.build_pydantic_model(p3)
    assert "products" in model3.model_fields
    
    json_schema = builder.build_json_schema(model3)
    assert json_schema["type"] == "object"
    assert "products" in json_schema["properties"]
