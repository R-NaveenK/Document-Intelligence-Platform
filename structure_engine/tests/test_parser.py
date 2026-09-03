import pytest
from app.request_parser.parser import RequestParser
from app.core.exceptions import RequestParsingError

def test_request_parser_category1_simple_requests():
    parser = RequestParser()
    
    # 1. "Give me the invoice number."
    p1 = parser.parse("Give me the invoice number.")
    assert len(p1.requested_fields) == 1
    assert p1.requested_fields[0].key == "invoice_number"
    
    # 2. "Give me the invoice number, invoice date and total amount."
    p2 = parser.parse("Give me the invoice number, invoice date and total amount.")
    keys2 = [f.key for f in p2.requested_fields]
    assert "invoice_number" in keys2
    assert "invoice_date" in keys2
    assert "total_amount" in keys2
    
    # 3. "Extract customer name, customer GSTIN and billing address."
    p3 = parser.parse("Extract customer name, customer GSTIN and billing address.")
    keys3 = [f.key for f in p3.requested_fields]
    assert "customer_name" in keys3
    assert "customer_gstin" in keys3
    assert "address" in keys3

def test_request_parser_category1_complex_and_synonyms():
    parser = RequestParser()
    
    # "final amount", "grand total", "total invoice value" mapping
    p1 = parser.parse("Extract grand total and final amount.")
    keys1 = [f.key for f in p1.requested_fields]
    assert "total_amount" in keys1
    
    # 4. "Give me all products with their quantity and price."
    p2 = parser.parse("Give me all products with their quantity and price.")
    list_fields = [f for f in p2.requested_fields if f.is_list]
    assert len(list_fields) == 1
    assert list_fields[0].key == "products"
    nested = [nf.key for nf in list_fields[0].nested_fields]
    assert "quantity" in nested
    assert "unit_price" in nested
    
    # 5. "Give me seller and customer information."
    p3 = parser.parse("Give me seller and customer information.")
    keys3 = [f.key for f in p3.requested_fields]
    assert "seller_name" in keys3
    assert "customer_name" in keys3
    
    # 6. "Extract the payment information."
    p4 = parser.parse("Extract the payment information.")
    assert len(p4.requested_fields) >= 1

def test_request_parser_invalid_input():
    parser = RequestParser()
    with pytest.raises(RequestParsingError):
        parser.parse("   ")
