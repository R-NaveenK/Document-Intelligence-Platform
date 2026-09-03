# Intelligent Document Processing — Validation Engine Module

A production-ready, deterministic, explainable, modular, open-source **Validation Engine** module built with Python 3.12+, Pydantic v2, PyYAML, RapidFuzz, and FastAPI.

---

## 📌 Architectural Position in Platform Pipeline

```
USER UPLOAD ──► INGESTION ──► OCR MODULE ──► HYBRID CLASSIFIER ──► SEPARATE & GROUP ──► NORMALIZATION ──► EXTRACTION / SCHEMA
                                                                                                                │
                                                                                                                ▼
                                                                                                   >>> VALIDATION ENGINE <<<
                                                                                                                │
                                                                                                                ▼
                                                                                                          RISK ANALYSIS
                                                                                                                │
                                                                                                                ▼
                                                                                                         ROUTING DECISION
                                                                                                    (AUTO_PROCESS / HUMAN_REVIEW)
```

---

## 🚀 Key Features & Architectural Principles

1. **4 Independent Validation Phases**: Executes Arithmetic, Format, Duplicate, and Date validation independently. If one validator fails, the remaining validators **MUST STILL RUN**.
2. **Hard Routing Gate**:
   - `ALL PASS` $\rightarrow$ `AUTO_PROCESS`
   - `ANY FAIL / WARNING` $\rightarrow$ `HUMAN_REVIEW`
   - Risk score measures problem severity and reviewer priority, but **NEVER** overrides the hard routing gate.
3. **Magnitude-Based Financial Math**: Uses Python `Decimal` to compute percentage difference $\frac{|actual - expected|}{expected} \times 100$, dynamically assigning severity and risk points based on magnitude.
4. **Deterministic & Explainable**: Every validation result item contains clear status, severity, risk points, reason, and structured evidence. No LLM decision-making.
5. **Config-Driven Business Rules**: Rules, risk weights, regex formats, and thresholds live in `config/validation_rules.yaml` and `config/risk_rules.yaml`.
6. **Zero-DB Standalone CLI Execution**: Works out of the box using `InMemoryRepository`, with a clean `PostgresRepository` interface for PostgreSQL integration.

---

## 🔍 Validation Phases

| Phase # | Validation Phase | Strategy & Details |
|---|---|---|
| **1** | **Arithmetic Validation** | Evaluates $qty \times unit\_price$, subtotal, tax, and total amount using `Decimal`. Calculates percentage difference and assigns magnitude-driven severity & risk points. |
| **2** | **Format Validation** | Enforces regex standards for GSTIN, Email, Phone, Invoice/PO numbers, and Pincodes. |
| **3** | **Duplicate Validation** | **Level 1**: Exact SHA-256 hash match (`FAIL`, `CRITICAL`, +35 points). <br> **Level 2**: `RapidFuzz` similarity scoring (<80% `PASS`, 80-94% `WARNING`, 95-99% `HIGH`, 100% `CRITICAL`). |
| **4** | **Date Validation** | Validates calendar validity and normalizes dates to ISO standard (`YYYY-MM-DD`) using `python-dateutil`. |

---

## 📑 Output JSON Contract Schema

```json
{
  "document_id": "INV-1001",
  "validation_results": [
    {
      "validator": "arithmetic",
      "status": "FAIL",
      "severity": "HIGH",
      "risk_points": 25,
      "message": "Invoice total differs from calculated total",
      "details": {
        "expected": 100000.0,
        "actual": 120000.0,
        "difference": 20000.0,
        "percentage_difference": 20.0
      }
    },
    {
      "validator": "format",
      "status": "PASS",
      "severity": "LOW",
      "risk_points": 0,
      "message": "Format validation passed for all checked fields",
      "details": {}
    },
    {
      "validator": "duplicate",
      "status": "PASS",
      "severity": "LOW",
      "risk_points": 0,
      "message": "No duplicate document detected",
      "details": {}
    },
    {
      "validator": "date",
      "status": "PASS",
      "severity": "LOW",
      "risk_points": 0,
      "message": "Date validation passed",
      "details": {}
    }
  ],
  "risk": {
    "score": 25,
    "level": "LOW"
  },
  "routing": {
    "decision": "HUMAN_REVIEW",
    "reason": "At least one validation did not pass (arithmetic)"
  }
}
```

---

## 📁 Multi-Format Document Ingestion & Report Export

The Validation Engine now supports **multi-format input file ingestion** and **multi-format report exports**:

### 📥 Supported Input File Formats
- **JSON Files (`.json`)**: Structured document JSON payloads.
- **PDF Documents (`.pdf`)**: Extracts structured fields and key-value pairs using `pypdf`.
- **Excel Spreadsheets (`.xlsx`, `.xls`)**: Reads tabular key-value invoice sheets using `openpyxl`.
- **CSV Files (`.csv`)**: Reads key-value or row-based data using Python `csv`.
- **Text & Markdown (`.txt`, `.md`, `.yaml`)**: Reads key-value pairs (`invoice_number: INV-1001`, `total_amount: 59000`).

---

### 📤 Exporting Validation Reports (`--export`)
You can export the generated **Validation Report** into formatted output files using the `--export` flag:

```bash
# Export report as PDF document (.pdf)
python main.py --input data/sample_invoice.txt --export pdf

# Export report as Excel spreadsheet (.xlsx)
python main.py --input data/sample_invoice.csv --export excel

# Export report as JSON file (.json)
python main.py --input data/valid_invoice.json --export json
```
All exported reports are saved automatically in the `reports/` directory!



---

## 🌐 Running FastAPI Server & Pytest Suite

```bash
# Run pytest automated test suite (15 passed)
python -m pytest -v

# Start FastAPI web server on http://127.0.0.1:8000
python main.py --server
```
