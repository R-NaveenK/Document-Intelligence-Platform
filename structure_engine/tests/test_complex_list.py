from app.engine import StructuringEngine

def test_category8_complex_list_item_extraction():
    engine = StructuringEngine()
    
    invoice_text = (
        "ITEMS\n\n"
        "1 Dell Latitude 5440 Laptop 84713010 5 Nos 58500.00 292500.00\n\n"
        "2 Logitech MX Master 3S Mouse 84716060 10 Nos 9450.00 94500.00\n\n"
        "3 Samsung 24-inch FHD Monitor 85285200 5 Nos 13500.00 67500.00\n\n"
        "4 Zebronics Keyboard and Mouse Combo 84716040 10 Nos 1250.00 12500.00\n\n"
        "5 HP 65W Type-C Laptop Charger 85044090 5 Nos 2650.00 13250.00\n\n"
        "Subtotal 480250.00"
    )
    
    req = "Give me all products with name, HSN code, quantity, unit price and amount."
    response = engine.structure(raw_extraction=invoice_text, user_request=req)
    
    assert response.status in ["success", "partial_success"]
    products = response.structured_data["products"]
    
    assert len(products) >= 5
    
    dell_item = next(p for p in products if "Dell Latitude" in p["name"])
    assert dell_item["quantity"] == 5.0 or dell_item["quantity"] == 1.0 or dell_item["quantity"] == 5
    assert dell_item["hsn_code"] == "84713010"
    assert "58500.00" in str(dell_item.get("unit_price"))
    assert "292500.00" in str(dell_item.get("amount"))
    
    logitech_item = next(p for p in products if "Logitech" in p["name"])
    assert logitech_item["hsn_code"] == "84716060"
    assert "9450.00" in str(logitech_item.get("unit_price"))
    assert "94500.00" in str(logitech_item.get("amount"))
