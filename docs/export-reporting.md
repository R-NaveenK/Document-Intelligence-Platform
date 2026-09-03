# Export & Business Reporting Architecture (Stage 8)

This document details the multi-format export engine, formula injection defense, single-source-of-truth `effectiveValue` resolution, asynchronous export job lifecycle (`export_jobs`), secure tenant file streaming, and PostgreSQL-powered reporting metrics.

---

## 1. Export Engine Architecture

```
Approved Structured Records
            │
            ▼
  `POST /api/v1/exports`
            │
            ▼
   `ExportService.createExportJob()`
            │
            ▼
   `ExportGenerators` Engine
   ├── CSV (Formula Escaped)
   ├── XLSX (Excel Multi-Sheet & Typed Cells)
   ├── JSON (Machine-Readable Structured JSON)
   ├── PDF (ReportLab/PDFKit Business Report)
   └── DOCX (Word Structured Report)
            │
            ▼
   Async Storage: `organizations/{orgId}/exports/{jobId}/{filename}`
            │
            ▼
   `GET /api/v1/exports/:exportJobId/download` (Tenant-Scoped Streaming)
```

---

## 2. Effective Value Export Rule

All standard business exports strictly resolve values using `effectiveValue`:
```text
effectiveValue = (humanValue !== null && humanValue !== undefined) ? humanValue : machineValue
```
If a human reviewer submits a correction (e.g., machine extracted `"1000"`, human corrected `"10000"`), **every format exports `10000`**. Stale machine values are never exported as completed business data.

---

## 3. Spreadsheet Formula Injection Defense

User-supplied text strings starting with dangerous formula execution prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically escaped by prefixing a single quote `'` in CSV and Excel exports:
- Input: `=SUM(A1:A2)`
- Exported Output: `'=SUM(A1:A2)`

This prevents spreadsheet software from executing arbitrary code when opening exported files.

---

## 4. Export Formats & Behavior

| Format | Features & Layout | Multi-Document Type Behavior |
|---|---|---|
| **CSV** | UTF-8, formula escaped, comma quoted | Dynamic fields union |
| **Excel (XLSX)** | Typed cells, auto-filter, summary sheet | Separate worksheet per document type |
| **JSON** | Full structured machine-readable payload | Mixed document types naturally supported |
| **PDF** | Professional formatted report with pagination | Distinct record sections per type |
| **DOCX** | Formatted Word document with summary table | Formatted section per record |

---

## 5. PostgreSQL Business Reporting Metrics (`GET /api/v1/reports/summary`)

Reporting metrics are computed strictly via PostgreSQL aggregations:
1. **Total Approved Records**: Count of records with `status = 'APPROVED'`.
2. **Records by Document Type**: Grouped breakdown array `[{ documentTypeId, count }]`.
3. **Review Rate**:
   $$\text{Review Rate} = \frac{\text{Documents requiring at least one human review}}{\text{Total processed documents}}$$
4. **Validation Pass Rate**:
   $$\text{Validation Pass Rate} = \frac{\text{Approved documents passing validation}}{\text{Total documents reaching validation}}$$
