# Extraction Engine 1 - Independent Document Extraction Module

An independent, production-ready **Extraction Engine (Engine 1)** built as a pluggable module for an Intelligent Document Processing (IDP) Platform.

---

## 1. Core Purpose

The sole responsibility of Extraction Engine 1 is:

```
    ORIGINAL DOCUMENT (PDF / IMAGE / EXCEL / WORD)
                          ↓
                  EXTRACTION ENGINE
                          ↓
            RAW TEXT + NUMERICAL CONTENT
```

It ingests input documents (PDF, JPG, PNG, TIFF, XLSX, XLS, DOCX, DOC) and produces **RAW UNSTRUCTURED TEXT** with recognition confidence metadata.

---

## 2. Quick Command Line Usage (Testing in Terminal)

You can run extractions directly from your terminal on any PDF, Image, Excel, or Word document:

```bash
# Extract text from Image, PDF, Excel, or Word document
python main.py path/to/your_invoice.png
python main.py path/to/your_invoice.pdf
python main.py path/to/your_invoice.xlsx
python main.py path/to/your_invoice.docx

# Output full JSON schema response
python main.py path/to/your_invoice.docx --json
```

---

## 3. Pluggable Architecture

The overall IDP Platform architecture is designed as follows:

```
                   ORIGINAL DOCUMENT
                           |
             +-------------+-------------+ 
             |             |             |
         ENGINE 1       ENGINE 2      ENGINE 3
      (This Module)   (Future Engine) (Future Engine)
             |             |             |
             +-------------+-------------+ 
                           |
                    COMPARISON ENGINE
                           |
                     BEST RAW OUTPUT
                           |
                    STRUCTURING LAYER
                           |
                       VALIDATION
```

---

## 4. Project Directory Structure

```
extraction_engine_3/
│
├── main.py                    # Terminal CLI entrypoint (python main.py <file>)
├── run.py                     # FastAPI server launcher (python run.py)
├── benchmark.py               # Benchmark runner (python benchmark.py)
├── run_evaluation.py          # Ground-truth accuracy metrics runner
│
├── app/
│   ├── api/routes.py          # FastAPI HTTP endpoints (/extract, /health, /version)
│   ├── core/                  # Configuration & Logging
│   ├── input/                 # Ingestion & Magic-byte format verification
│   ├── pdf/                   # PyMuPDF digital text & scanned page renderer
│   ├── excel/                 # Openpyxl spreadsheet text & number handler
│   ├── word/                  # Python-docx paragraph & table text handler
│   ├── preprocessing/         # OpenCV contrast/deskew preprocessor
│   ├── ocr/                   # BaseExtractionEngine & PaddleOCR model manager
│   ├── assembly/              # Text box sorting & confidence aggregator
│   ├── models/                # ExtractionResult Pydantic schema
│   └── engine.py              # Python programmatic ExtractionEngine wrapper
│
├── sample_documents/          # Sample PDFs, images, Excel, Word & ground-truth files
├── tests/                     # 24 automated Pytest unit & integration tests
├── Dockerfile                 # Docker container specification
├── requirements.txt           # Project dependencies
├── .env.example               # Environment settings template
└── README.md                  # Documentation
```

---

## 5. Installation & Running Services

### Installation
```bash
pip install -r requirements.txt
```

### Running as a FastAPI HTTP Service
```bash
python run.py
```
View interactive documentation at `http://localhost:8000/docs`.

### Running with Docker
```bash
docker build -t extraction-engine-1 .
docker run -p 8000:8000 extraction-engine-1
```

---

## 6. Programmatic Python Usage

```python
from app.engine import ExtractionEngine

engine = ExtractionEngine()
result = engine.extract("path/to/invoice.docx")

print("Status:", result.status)
print("Confidence:", result.extraction_confidence)
print("Raw Text:\n", result.raw_text)
```

---

## 7. Testing & Benchmarking

```bash
# Run full pytest test suite (36 tests)
python -m pytest -v tests/

# Run benchmark evaluation
python benchmark.py --sample-dir sample_documents --output benchmark_results.json

# Run ground-truth accuracy evaluation
python run_evaluation.py
```

---

## 8. Raw Extraction Artifact Persistence

### Purpose
Downstream modules (such as the Structuring Engine) require direct access to the complete, uninterpreted raw extraction result as an unstructured text file on disk, rather than relying solely on in-memory process piping or terminal logs.

```
ORIGINAL DOCUMENT
       ↓
EXTRACTION ENGINE
       ↓
RAW UNSTRUCTURED EXTRACTION
       ↓
SAVE AS FILE (Atomic UTF-8 write)
       ↓
data/raw_extraction/<document_id>.txt
       ↓
DOWNSTREAM STRUCTURING ENGINE
```

The persisted text remains **100% RAW and UNSTRUCTURED**:
- No semantic field selection or inference
- No conversion to JSON schema or summarization
- Exact preservation of detected text, numbers, dates, currency symbols (`₹`, `€`, `$`, `£`, `¥`), punctuation, and OCR reading order
- Page boundaries preserved for multi-page documents

### Storage Location & Configuration
Raw extraction files are persisted to the path configured by `RAW_EXTRACTION_DIR`:
```bash
RAW_EXTRACTION_DIR=./data/raw_extraction
```
The directory is created automatically if it does not exist. Paths are normalized and platform-independent.

### File Naming Convention
Every generated artifact has a safe and stable identifier:
- **Provided `document_id`**: If the caller passes a `document_id` (e.g. `doc_20260903_001`), it is strictly validated against path traversal (`..`, `/`, `\`) and unsafe characters before writing: `data/raw_extraction/doc_20260903_001.txt`.
- **Auto-generated `document_id`**: If omitted, the engine automatically assigns a safe unique identifier: `doc_<YYYYMMDD_HHMMSS>_<short_hex>` (e.g. `doc_20260902_190634_7755f219.txt`).

### Multi-Page Boundary Preservation
For multi-page documents, page boundaries are preserved using standard metadata markers:
```
----------------------------------------
PAGE 1
----------------------------------------

[raw extracted text from page 1]

----------------------------------------
PAGE 2
----------------------------------------

[raw extracted text from page 2]
```

### Encoding & Atomic File Writing
- **Encoding**: UTF-8 without BOM, preserving Unicode characters, accents, currency signs, and multilingual text.
- **Atomic Operations**: Files are written to temporary files (`.tmp`) in the target directory, flushed, synced to disk (`os.fsync`), and atomically renamed via `os.replace` to ensure no half-written or corrupted artifacts exist during concurrent workloads.

### Output Contract
The standard `ExtractionResult` contract exposes the artifact's location:
```json
{
  "engine_id": "engine_1",
  "status": "success",
  "document_id": "doc_20260903_001",
  "raw_file_path": "data/raw_extraction/doc_20260903_001.txt",
  "raw_file_id": "doc_20260903_001.txt",
  "raw_text": "...",
  "pages": [...],
  "extraction_confidence": 0.985,
  "pages_processed": 1,
  "failed_pages": [],
  "processing_time_ms": 125,
  "original_filename": "invoice_001.pdf",
  "file_type": "pdf",
  "engine_version": "1.0.0",
  "warnings": [],
  "errors": []
}
```

### Downstream Module Consumption
Downstream consumers (such as the Structuring Engine) can read the artifact directly using the returned `raw_file_path` or `raw_file_id`:
```python
with open(result.raw_file_path, "r", encoding="utf-8") as f:
    raw_unstructured_text = f.read()
```

### Error Behavior & Security
- **Failed Extractions**: If an extraction fails, no raw file is created (`raw_file_path` and `raw_file_id` are `null`), preventing misleading artifacts.
- **Path Traversal Protection**: Inputs containing directory traversal (`..`, slashes, null bytes) or Windows reserved names are rejected immediately with `InvalidDocumentIdError` (HTTP 400).
- **Log Privacy**: Extracted document text is never dumped into logs. Logs record operational metadata only (`document_id`, `pages`, `characters`, `processing_time_ms`, `artifact`, `status`).
