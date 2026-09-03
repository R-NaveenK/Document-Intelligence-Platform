# Living Schema Architecture & Custom Field Reprocessing (Stage 9)

This document details the platform's **Living Schema** capability, which allows users to add new custom fields to existing profiles, publish new schema versions, and extract newly added fields from historical documents using stored raw evidence—**without requiring original document re-upload or OCR rerun**.

---

## 1. Core Architectural Workflow

```
User Adds New Custom Field (e.g. `reference_number`)
            │
            ▼
   `ProfileService.publishSchema()` -> New Version (e.g. Version 2)
            │
            ▼
   `POST /api/v1/reprocessing/preview` (Calculate Eligible Records)
            │
            ▼
   `POST /api/v1/reprocessing/jobs` (Start Historical Reprocessing)
            │
            ▼
   `RawEvidenceService.getStoredRawEvidence()`
   ├── Reuses Stored OCR Text, Tables & Bounding Boxes
   └── ZERO Document Re-Upload & ZERO OCR Rerun
            │
            ▼
   Targeted Structuring Extraction
   ├── Extracts ONLY Newly Requested Fields (`fieldsAdded`)
   └── Preserves Existing Fields (`name`, `date`, `amount`) Untouched
            │
            ▼
   Validation & Human Review (Low Confidence / Missing Fields)
            │
            ▼
   Merge Enriched Fields into `StructuredDataService`
   ├── Provenance: `sourceType = 'HISTORICAL_REPROCESSING'`
   ├── Original Schema Version Preserved (`originalSchemaVersionId = v1`)
   └── Current Enrichment Schema Updated (`currentEnrichmentSchemaVersionId = v2`)
            │
            ▼
   Automatic Search Index, AI Chat Context & Export Refresh
```

---

## 2. Dual Schema Versioning Principle

To maintain complete historical auditability, structured records preserve two schema references:
- `originalSchemaVersionId`: The schema version active when the document was originally uploaded and processed.
- `currentEnrichmentSchemaVersionId`: The latest schema version whose newly added fields have been successfully extracted and merged.

Historical processing metadata is **never overwritten or altered** when a document undergoes living schema enrichment.

---

## 3. Schema Diff Analyzer (`SchemaDiffService`)

When comparing two schema versions, `SchemaDiffService.diffSchemas(oldSchema, newSchema)` computes:
- `fieldsAdded`: Array of newly introduced fields eligible for historical reprocessing.
- `fieldsChanged`: Array of fields with modified data types or validation rules.
- `fieldsDisabled`: Array of disabled fields (historical data retained; suppressed from future processing).

---

## 4. Partial Failure Handling

Historical reprocessing jobs do not fail as an all-or-nothing batch. If 100 records are submitted:
- 90 succeed
- 7 require human review
- 3 fail (e.g. raw evidence unavailable)

The job completes with status `PARTIALLY_COMPLETED` alongside counts (`successfulRecords: 90`, `reviewRequiredRecords: 7`, `failedRecords: 3`). Failed items can be retried individually via `POST /api/v1/reprocessing/jobs/:jobId/retry-failed`.

> [!IMPORTANT]
> If historical field enrichment fails for a record, the original approved record remains **`APPROVED`**. It is never set to `FAILED`.
