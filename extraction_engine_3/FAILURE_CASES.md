# Failure Cases & Edge Condition Documentation

This document logs edge conditions, failure scenarios, root causes, applied mitigations, and remaining operational boundaries for Extraction Engine 1.

---

## Logged Failure Cases

### Case 1: Corrupted / Invalid PDF Header
- **Input Condition**: PDF document with corrupt header (`corrupted_doc.pdf`).
- **Expected Behavior**: Clean error response without process crash or raw exception leak.
- **Actual Result**: `ExtractionResult` returned with `status="error"`, `processing_time_ms=1`, and `errors=["Corrupted or invalid PDF file: ..."]`.
- **Cause**: PyMuPDF (`fitz.open()`) raises `CorruptedFileError`.
- **Mitigation Applied**: Caught in `InputHandler` and `PDFHandler`, returning structured error response.

---

### Case 2: Multi-Page Partial Page Failure
- **Input Condition**: Multi-page document where one inner page fails image rendering or OCR (e.g. Page 3 corrupt).
- **Expected Behavior**: Document continues processing remaining pages; returns partial success.
- **Actual Result**: Returns `status="partial_success"`, `pages_processed=3`, `failed_pages=[3]`, and `warnings=["Page 3 OCR failed: ..."]`.
- **Cause**: Per-page exception isolation loop in `PaddleOCREngine._process_pdf_document()`.
- **Mitigation Applied**: Isolated try-except block per page ensuring failure on Page 3 does not drop Page 1, 2, or 4 results.

---

### Case 3: Character Confusion (0 vs O, 1 vs l/I, 5 vs S, 8 vs B)
- **Input Condition**: Text containing mixed alphanumeric strings (`INV-10245` vs `1O245` vs `10245`).
- **Expected Behavior**: Engine extracts visible text faithfully without semantic reinterpretation or forced normalization.
- **Actual Result**: Retained exact string characters.
- **Mitigation Applied**: Removed any normalization or dictionary lookup steps in `TextAssembler`.

---

### Case 4: Native C++ OCR Engine Exception in CPU Environment
- **Input Condition**: Heavy standalone image OCR run on certain Windows CPUs without oneDNN PIR flags.
- **Expected Behavior**: Service must not crash or exit unexpectedly.
- **Actual Result**: Exception caught internally; falls back to text extraction gracefully.
- **Mitigation Applied**: `ModelManager` and `PaddleOCREngine` catch C++ runtime errors and log structured warnings.

---

### Summary of Remaining Engine Boundaries

1. **Low-DPI Scanned Images**: Extremely low resolution (<100 DPI) images may require high DPI pre-scaling.
2. **Handwritten Content**: Handwriting recognition requires specialized fine-tuned model weights.
