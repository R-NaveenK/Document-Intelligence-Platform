# Structuring Engine

Production-ready **Structuring Layer** module for Intelligent Document Processing (IDP).

The Structuring Layer receives:
1. **Raw unstructured extraction output** (from upstream OCR / Extraction / Comparison Engine)
2. **Natural language user request** (describing required fields)

And outputs:
3. **Structured data** conforming strictly to dynamically generated target schemas.

---

## Six-Component Pipeline Architecture

1. **Request Parser**: Converts natural language requests into structured field requirements.
2. **Schema Builder**: Dynamically constructs Pydantic BaseModel & JSON Schema definitions.
3. **Candidate Finder**: Employs hybrid candidate retrieval (Regex rules + RapidFuzz alias search).
4. **Field Extractor**: Performs context-aware value extraction, preserving raw strings without hallucination.
5. **Structured Output Generator**: Instantiates dynamic schema models with type validation.
6. **Output Formatter**: Packages response into standardized API response payload.

---

## Quickstart

### Running the API Server

```bash
python run.py
```

API will start at `http://localhost:8001`.
Endpoints:
- `POST /structure`: Main document structuring endpoint.
- `GET /health`: Health status.
- `GET /version`: Engine version.

### Programmatic Usage

```python
from app.engine import StructuringEngine

engine = StructuringEngine()

raw_text = "Tax Invoice\nInvoice No: INV-2026/001\nBilled To: ACME Corp\nTotal: ₹10,000.00"
request = "Give me invoice number, customer name and total amount."

response = engine.structure(raw_extraction=raw_text, user_request=request)

print(response.structured_data)
# {'invoice_number': 'INV-2026/001', 'customer_name': 'ACME Corp', 'total_amount': '₹10,000.00'}
```

### Running Tests

```bash
pytest -v tests/
```
