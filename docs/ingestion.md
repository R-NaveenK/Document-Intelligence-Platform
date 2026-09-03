# Document Upload & Ingestion Architecture (Stage 3)

This document details the document upload lifecycle, file validation rules, SHA-256 duplicate detection, storage abstraction, frozen schema versioning, extraction handoff, failure handling, and job retries.

---

## 1. Document Ingestion Lifecycle

```
User Selects Published Profile & Uploads File(s)
                 │
                 ▼
1. Validation (MIME, Extension, Max Size MB, Magic Bytes)
                 │
                 ▼
2. Path Traversal Protection (Sanitizes user filename)
                 │
                 ▼
3. SHA-256 Checksum Duplicate Detection (Per Organization)
                 │
                 ▼
4. Original File Storage (`storageService` Abstraction)
                 │
                 ▼
5. Create Document Record & Freeze Schema Version
                 │
                 ▼
6. Create Processing Job (Initial Status: QUEUED)
                 │
                 ▼
7. Non-blocking Async Handoff to Extraction Service (`POST /api/v1/extract`)
                 │
                 ├──► Success: Status transitions to `EXTRACTING`
                 └──► Failure: Job status set to `FAILED` (Original file preserved for Retry)
```

---

## 2. Security & File Validation Rules

1. **Allowed Extensions**: `.pdf`, `.png`, `.jpg`, `.jpeg`.
2. **Allowed MIME Types**: `application/pdf`, `image/png`, `image/jpeg`, `image/jpg`.
3. **Magic Byte Verification**:
   - PDF: `%PDF` (`0x25 0x50 0x44 0x46`)
   - PNG: `\x89PNG` (`0x89 0x50 0x4E 0x47`)
   - JPEG: `0xFF 0xD8 0xFF`
4. **File Size Enforcement**: Controlled via `MAX_UPLOAD_SIZE_MB` environment variable (default: `25MB`).
5. **Path Traversal Protection**: User-supplied filenames are sanitized to prevent directory traversal (`../../../dangerous.pdf` -> `dangerous.pdf`). Physical storage uses internal generated UUIDs.

---

## 3. Storage Abstraction Layer (`storageService`)

Files are saved using an organization-scoped storage hierarchy:

```
storage/
└── organizations/
    └── {organizationId}/
        └── documents/
            └── {documentId}/
                └── original.pdf
```

The application interacts strictly with `storageService.storeFile()`, `getFile()`, and `deleteFile()`, allowing seamless future migration to S3 / MinIO.

---

## 4. Frozen Schema Versioning & Reproducibility

When a document is ingested:
1. The currently **PUBLISHED** schema version ID and number are retrieved from the selected processing profile.
2. The schema version is **frozen** inside both the `documents` and `processing_jobs` records.
3. Subsequent edits to the profile schema in DRAFT mode do **NOT** alter the schema version of previously ingested documents.

---

## 5. Duplicate File Detection

Every uploaded file buffer generates a SHA-256 checksum. Duplicate detection is scoped per organization:
- `organization_id + checksum`

If an exact duplicate is uploaded within the same organization, the API returns a structured `DUPLICATE_DOCUMENT` error without creating a duplicate record:

```json
{
  "success": false,
  "data": {
    "duplicateDocumentId": "doc_uuid_123"
  },
  "error": {
    "code": "DUPLICATE_DOCUMENT",
    "message": "Document 'invoice.pdf' already exists in your organization."
  }
}
```

---

## 6. Extraction Handoff & Failure Handling

After file storage, the Express backend responds to the HTTP upload request and dispatches an asynchronous handoff call to the Extraction Mock Service (`POST /api/v1/extract`).

### Important Failure Rule
If the Extraction Service is unreachable or returns an error:
- The original file **remains stored**.
- The `documents` and `processing_jobs` records **remain preserved**.
- Job status is set to `FAILED`.
- The failure reason is recorded in `processing_steps`.

### Job Retry Mechanism
Users can retry failed jobs via `POST /api/v1/jobs/:jobId/retry`.
- Increments `retryCount`.
- Status transitions: `RETRYING` -> `EXTRACTING`.
- Re-triggers the extraction handoff request.
