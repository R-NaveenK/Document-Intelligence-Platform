# Structuring Engine Module (Structuring Layer)

The **Structuring Engine** converts unstructured raw OCR text extractions and natural language user requests into dynamic, schema-validated structured JSON payloads.

---

## Architecture & Pipeline Flow

```
RAW UNSTRUCTURED OCR EXTRACTION + USER REQUEST
                    │
                    ▼
          ┌───────────────────┐
          │  Request Parser   │  (Natural language intent & synonym resolution)
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │  Schema Builder   │  (Dynamic Pydantic v2 & JSON Schema compiler)
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │ Candidate Finder  │  (Hybrid regex rules & rapid fuzzy search)
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │  Field Extractor  │  (Contextual disambiguation & value extraction)
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │ Output Generator  │  (Schema validation & strict type conversion)
          └─────────┬─────────┘
                    │
                    ▼
          ┌───────────────────┐
          │ Output Formatter  │  (Standard response contract & metadata payload)
          └───────────────────┘
                    │
                    ▼
       STRUCTURED JSON PAYLOAD (Ready for Validation Layer)
```

---

## 6 Pipeline Components

1. **`RequestParser`** (`app/request_parser/parser.py`): Converts natural language prompts into target field intents (`FieldDefinition`), mapping synonyms, compiling semantic representations, and detecting nested table requests.
2. **`SchemaBuilder`** (`app/schema_builder/builder.py`): Dynamically compiles Pydantic v2 models and JSON Schemas on-the-fly (`pydantic.create_model`) with LRU caching.
3. **`CandidateFinder`** (`app/candidate_finder/finder.py`): Scans raw document lines using deterministic regex patterns, RapidFuzz ratio matching, and Tier 3 Semantic Concept Search.
4. **`FieldExtractor`** (`app/field_extractor/extractor.py`): Disambiguates candidates using multi-source hybrid evidence (concept vectors, positive/negative context cues, value-type checks), preserving exact raw source strings.
5. **`StructuredOutputGenerator`** (`app/output_generator/generator.py`): Validates extracted values against the dynamic target Pydantic schema.
6. **`OutputFormatter`** (`app/formatter/formatter.py`): Assembles standard API payload contract (`StructuringResponse`), generating per-field status indicators (`found`, `not_found`, `ambiguous`).

### Semantic Field Understanding Engine (`app/semantic/`)
Provides conceptual understanding for unseen expressions (e.g. `billing reference` -> `Bill No: INV-2026-0098`, `amount payable` -> `Grand Total: ₹48,500.00`, `buyer organization` -> `Bill To: ABC INDUSTRIES LTD`), contextual positive/negative weighting, value-type compatibility, and dynamic user-defined schema adaptation.

---

## Programmatic Usage Example

```python
from app.engine import StructuringEngine

engine = StructuringEngine()

raw_text = """
TAX INVOICE
Invoice No: TSPL/INV/2026-27/0897
Invoice Date: 02-09-2026
BILL TO: ABC INDUSTRIES LTD
Total Invoice Amount: ₹4,89,075.00
"""

user_request = "Extract invoice number, invoice date, customer name and total amount"

response = engine.structure(raw_extraction=raw_text, user_request=user_request)

print(response.status)           # "success"
print(response.structured_data)  # {"invoice_number": "TSPL/INV/2026-27/0897", ...}
```

---

## CLI Terminal Usage

```bash
python cli.py --request "Extract invoice number, invoice date, customer name and total amount" --file sample_data/sample_techsolutions.txt
```

---

## API Endpoints

### 1. Structure Document Endpoint
`POST /structure`

**Request Body (`application/json`)**:
```json
{
  "user_request": "Extract invoice number, invoice date, customer name and total amount",
  "raw_extraction": {
    "document_id": "DOC-INV-001",
    "raw_text": "TAX INVOICE\nInvoice No: TSPL/INV/2026-27/0897\nInvoice Date: 02-09-2026\nBILL TO: ABC INDUSTRIES LTD\nTotal Invoice Amount: 489075.00",
    "extraction_confidence": 0.98
  }
}
```

**Response Body (`200 OK`)**:
```json
{
  "status": "success",
  "document_id": "DOC-INV-001",
  "structured_data": {
    "invoice_number": "TSPL/INV/2026-27/0897",
    "invoice_date": "02-09-2026",
    "customer_name": "ABC INDUSTRIES LTD",
    "total_amount": "489075.00"
  },
  "field_status": {
    "invoice_number": "found",
    "invoice_date": "found",
    "customer_name": "found",
    "total_amount": "found"
  },
  "summary": {
    "total_requested": 4,
    "found_count": 4,
    "not_found_count": 0,
    "ambiguous_count": 0
  },
  "processing_time_ms": 2.65
}
```

---

## Configuration Settings (`app/core/config.py`)

Configurable parameters are managed centrally using environment variables or defaults:

- `LOG_LEVEL`: Default `"INFO"`
- `FUZZY_MATCH_THRESHOLD`: Default `75.0`
- `HIGH_CONFIDENCE_THRESHOLD`: Default `0.65`
- `LOW_CONFIDENCE_THRESHOLD`: Default `0.60`
- `MAX_CANDIDATES_PER_FIELD`: Default `8`
- `MAX_TEXT_LENGTH_BYTES`: Default `5242880` (5 MB)
