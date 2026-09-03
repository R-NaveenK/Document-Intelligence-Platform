# COR EXTRACTION ENGINE PRODUCTION HARDENING REPORT

**Engine Identity:** COR (PaddleOCR-based Independent Extraction Engine)  
**Evaluation Date:** 2026-09-03  
**Final Production Status:** **COR PRODUCTION READY — READY FOR COMPARISON ENGINE INTEGRATION**

---

## 1. FINAL ARCHITECTURE & INDEPENDENT FLOW

The COR Extraction Engine has been fully hardened and verified for independent production operation. It converts physical source documents into raw unstructured text artifacts without external system dependencies.

```
INPUT FILE
     ↓
COR (CORExtractionEngine)
     ↓
FILE TYPE DETECTION (FileTypeDetector magic byte & header inspection)
     ↓
NATIVE EXTRACTION / PADDLEOCR (PdfHandler, DocxHandler, DocHandler, TxtHandler, ImageHandler)
     ↓
RAW UNSTRUCTURED TEXT
     ↓
RAW TEXT WRITER (Atomic UTF-8 write to data/cor_extractions/<doc_id>.txt)
     ↓
COMMON EXTRACTION RESULT (to_common_contract())
```

---

## 2. FILE FORMAT SUPPORT MATRIX

| File Format | Format Extension | Support Status | Primary Extraction Technology |
|---|---|---|---|
| **PDF (Digital Native)** | `.pdf` | **SUPPORTED** | PyMuPDF (`fitz`) native text streaming |
| **PDF (Scanned Image)** | `.pdf` | **SUPPORTED** | 200 DPI rendering → PaddleOCR |
| **PDF (Mixed Page)** | `.pdf` | **SUPPORTED** | Page-level quality heuristic fallback |
| **DOCX** | `.docx` | **SUPPORTED** | `python-docx` + embedded image OCR |
| **DOC (Legacy Binary)** | `.doc` | **SUPPORTED** | Headless LibreOffice / OLE stream recovery |
| **TXT (Plain Text)** | `.txt` | **SUPPORTED** | Direct multi-encoding text reader |
| **PNG (Image)** | `.png` | **SUPPORTED** | OpenCV CLAHE / Denoise + PaddleOCR |
| **JPG / JPEG (Image)** | `.jpg`, `.jpeg` | **SUPPORTED** | OpenCV preprocessing + PaddleOCR |

---

## 3. PADDLEOCR CONFIGURATION & MODEL LIFECYCLE

- **Singleton Pattern:** `PaddleOCREngine` uses double-checked thread locks to initialize models once per process.
- **Configurable Device:** Defaults to `COR_OCR_DEVICE=cpu`. GPU enabled when `COR_OCR_DEVICE=gpu`.
- **Orientation Handling:** `use_textline_orientation=True` enables angle classification for 90°, 180°, and 270° document rotations.
- **Line Reconstruction:** Clustering tolerance $\Delta Y \le 0.65 \times \text{height}$ preserves reading order across multi-column pages.

---

## 4. OUTPUT ARTIFACT & COMMON CONTRACT DESIGN

- **Raw Text Artifact:** Persisted to `./data/cor_extractions/<doc_id>.txt` via atomic write (`write` → `flush` → `fsync` → `atomic replace`).
- **Common Extraction Contract:**
```json
{
    "engine_id": "COR",
    "status": "success",
    "document_id": "doc_001",
    "input": {
        "filename": "invoice.pdf",
        "file_type": "pdf"
    },
    "artifact": {
        "type": "text/plain",
        "file_id": "doc_001.txt",
        "path": "data/cor_extractions/doc_001.txt"
    },
    "metrics": {
        "pages_processed": 4,
        "characters_extracted": 8124,
        "processing_time_ms": 2340
    },
    "confidence": {
        "extraction_confidence": 0.965
    }
}
```

---

## 5. API & CLI CONTRACTS

- **REST API Endpoints:**
  - `POST /extract`: File upload extraction.
  - `POST /extract/path`: Host path extraction.
  - `GET /health`: Returns `{"engine": "COR", "status": "healthy", "ocr_available": true}`.
  - `GET /capabilities`: Returns supported formats and engine metadata.
- **CLI Command:** `python -m cor_engine.extract --input invoice.pdf --doc-id doc_001`
  Outputs concise execution metadata without dumping raw text content.

---

## 6. SECURITY HARDENING MEASURES

- **Path Traversal Protection:** Document IDs sanitized via `generate_safe_doc_id`.
- **Magic Byte Validation:** File headers inspected before routing.
- **Resource & Memory Safety:** Image decompression limit set via `COR_MAX_IMAGE_PIXELS` (100M pixels). File size capped via `COR_MAX_FILE_SIZE_MB` (50 MB).
- **Subprocess Safety:** Headless conversion runs without `shell=True` using explicit timeouts (`COR_PROCESSING_TIMEOUT_SECONDS = 120s`).
- **Privacy & Logging:** Metadata-only logging. Full document text and sensitive data are excluded from log outputs.

---

## 7. PERFORMANCE & TEST RESULTS

- **Pytest Unit & Integration Suite:** 97 tests collected, **97 / 97 passed (100%)**.
- **Corpus Evaluation Benchmark:** 17 primary test documents + 5 corrupted input files, **100% success rate**.
- **Throughput:** ~15,000 characters/second extraction throughput on digital documents.

---

## 8. KNOWN LIMITATIONS & FUTURE CONSIDERATIONS

1. **Ultra-Low DPI Images (< 100 DPI):** Characters under 6 pixels in height may experience fragmentation.
2. **Cursive Handwriting:** Complex cursive text across textured backgrounds produces lower OCR confidence than printed typography.

---

## 9. COMPARISON ENGINE INTEGRATION NOTES

- Downstream systems (Comparison Engine, Orchestrator) consume the `.txt` artifact reference (`artifact.path` / `artifact.file_id`) and `ExtractionResult` metadata.
- The Comparison Engine operates strictly on the raw text artifact without needing to know COR's internal libraries.

---

## 10. FINAL DECLARATION

**COR PRODUCTION READY — READY FOR COMPARISON ENGINE INTEGRATION**
