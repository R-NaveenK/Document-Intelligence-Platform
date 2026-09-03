def test_api_health(api_client):
    res = api_client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["engine_ready"] is True

def test_api_version(api_client):
    res = api_client.get("/version")
    assert res.status_code == 200
    data = res.json()
    assert "version" in data

def test_api_structure_endpoint(api_client, sample_invoice_raw_dict):
    payload = {
        "user_request": "I need the invoice number, customer name and total amount.",
        "raw_extraction": sample_invoice_raw_dict,
        "metadata": {"test": "true"}
    }
    
    res = api_client.post("/structure", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["structured_data"]["invoice_number"] == "TSPL/INV/2026-27/0897"
    assert data["structured_data"]["customer_name"] == "ABC INDUSTRIES LTD."
