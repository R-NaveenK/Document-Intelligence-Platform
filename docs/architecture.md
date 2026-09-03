# Intelligent Document Processing Platform - Architecture & Design Document

## 1. System Overview

The Intelligent Document Processing (IDP) Platform is designed as a high-throughput, microservice-oriented monorepo. The core system coordinates document ingestion, preprocessing/OCR extraction, classification, field structuring, validation, and storage.

```
Frontend (Vanilla JS/HTML5)
       │
       ▼
Express API Gateway (Node.js) ◄──► PostgreSQL (JSONB + FTS) & Redis
       │
       ├──► 1. Preprocessing & Extraction Mock Service (HTTP/REST)
       ├──► 2. Hybrid Classifier Service (Python FastAPI)
       ├──► 3. Structuring Layer Mock Service (HTTP/REST)
       └──► 4. Validation Engine Mock Service (HTTP/REST)
```

## 2. Core Architectural Separation

### Data Model Hierarchy: FILE vs PAGE vs LOGICAL DOCUMENT

A critical foundation of this architecture is the strict separation between physical upload boundaries and logical domain entities:

1. **FILE (`documents`)**:
   - Represents the raw physical file uploaded by the user (e.g., `invoice_batch_2026.pdf`).
   - Contains global file metadata (`storage_path`, `file_size`, `mime_type`, `page_count`).
   - Belongs strictly to an `organization`.

2. **PAGE (`document_pages`)**:
   - Represents an individual page extracted from a physical file.
   - Holds page-level OCR text, confidence scores, and PostgreSQL `tsvector` generated columns for Full Text Search (FTS).

3. **LOGICAL DOCUMENT (`logical_documents`)**:
   - Represents a semantically distinct document unit (e.g., an individual Invoice or Purchase Order found within a multi-page PDF bundle).
   - Maps to one or more pages via `logical_document_pages`.
   - Links directly to a `document_type` (e.g., INVOICE, RECEIPT) and contains extracted `field_values` and `validation_results`.

## 3. Data Processing Flow

1. **Ingestion**: File is uploaded to S3-compatible private object storage; entry created in `documents` table with status `UPLOADED`.
2. **Preprocessing + Extraction**: Document pages are processed by the Extraction service to retrieve raw text, OCR confidence, bounding boxes, and tables. Status set to `EXTRACTING`.
3. **Hybrid Classification**: Raw pages are classified by the Python FastAPI service into page groups representing logical documents. Status set to `CLASSIFYING`.
4. **Structuring Layer**: Fields defined in the schema version are extracted and normalized for each logical document. Status set to `STRUCTURING`.
5. **Validation Engine**: Structural, format, and business validation rules are evaluated. Status set to `VALIDATING`.
6. **Review / Approval**: If confidence thresholds or validation rules fail, status transitions to `NEEDS_REVIEW`; otherwise `APPROVED`.

## 4. Centralized Status Lifecycle

The system utilizes 12 standard processing statuses frozen in `shared/constants/statuses.js`:
- `UPLOADED`
- `QUEUED`
- `PREPROCESSING`
- `EXTRACTING`
- `CLASSIFYING`
- `STRUCTURING`
- `VALIDATING`
- `NEEDS_REVIEW`
- `APPROVED`
- `FAILED`
- `RETRYING`
- `REJECTED`
