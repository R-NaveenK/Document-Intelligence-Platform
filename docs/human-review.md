# Human Review Workflow Architecture (Stage 5)

This document details the multi-category Human Review System (`CLASSIFICATION`, `FIELD`, `VALIDATION`), machine vs. human value separation, frozen schema type validation, page grouping corrections, revalidation through the Validation service, optimistic concurrency protection, and pipeline resume behavior.

---

## 1. Review Workflow Architecture Overview

```
Pipeline Stage Failure / Low Confidence / Validation Failure
                           │
                           ▼
            `ReviewService.createReviewItem()`
                           │
                           ▼
          Job Status set to `NEEDS_REVIEW`
                           │
                           ▼
                 Human Review Queue
                           │
                           ▼
            Reviewer Opens Review Workspace
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
      Classification     Field       Validation
        Correction    Correction    Correction
             │             │             │
             │             ▼             ▼
             │       Store Separate  Revalidate via
             │       `humanValue` &  Teammate Service
             │      `effectiveValue`  (`POST /validate`)
             └─────────────┬─────────────┘
                           │
                           ▼
                  Resolve Review Item
                           │
                           ▼
     Pipeline Resume Evaluator (0 Blocking Items)
                           │
                           ▼
      Job Status updated from `NEEDS_REVIEW` -> `APPROVED` / Pipeline Resumed
```

---

## 2. Review Categories & Shared Constants

Defined in [`shared/constants/reviewConstants.js`](file:///d:/Document-intelligence-platform/shared/constants/reviewConstants.js):

### Categories (`REVIEW_TYPES`)
1. `CLASSIFICATION`: Triggered when classification confidence is low or document type is `UNKNOWN`.
2. `FIELD`: Triggered when structured field confidence is low or required field is missing.
3. `VALIDATION`: Triggered when rule assertion or teammate validation service check fails.

### Review States (`REVIEW_STATUS`)
- `OPEN`: Initial state upon creation.
- `IN_PROGRESS`: Reviewer has opened workspace and begun correction.
- `RESOLVED`: Issue corrected and verified; pipeline ready to resume.
- `REJECTED`: Issue marked invalid or rejected by reviewer.

---

## 3. Machine vs. Human Value Separation & Effective Value

To ensure 100% field-level auditability and traceability, original machine output is **NEVER** overwritten.

### Data Model (`field_values` & `review_items`):
- `machineValue`: Original raw value extracted by automated pipeline.
- `humanValue`: Corrected value entered by human reviewer.
- `effectiveValue`: Downstream effective value:
  ```text
  effectiveValue = humanValue !== null ? humanValue : machineValue
  ```

---

## 4. Frozen Schema Document Type Enforcement

When performing a **Classification Correction**:
- The reviewer selects a target document type from a dropdown.
- `ReviewService` validates `documentTypeId` against the **frozen schema version** of the processing job.
- If the selected document type is not part of the frozen schema version, the correction is rejected with error code `INVALID_DOCUMENT_TYPE`.

---

## 5. Revalidation Flow

For **Validation Review** items:
1. Reviewer corrects invalid field value.
2. Reviewer clicks **"Correct & Revalidate"**.
3. `ReviewService.revalidateReview()` invokes the teammate Validation Mock service (`POST /api/v1/validate`).
4. If validation passes: review item status is set to `RESOLVED`, `resolvedAt` timestamp is saved, and pipeline resume is evaluated.
5. If validation fails: review item remains `IN_PROGRESS` with error message.

---

## 6. Optimistic Concurrency Protection

Every review item maintains a `row_version` integer:
- When a reviewer loads a review workspace, `rowVersion` is fetched.
- When submitting a correction, `rowVersion` is passed in the HTTP request payload.
- If another reviewer has updated the record in the interim (`incomingRowVersion !== item.rowVersion`), the API returns HTTP 409 `REVIEW_CONFLICT`.

---

## 7. Pipeline Resume Evaluator

When a review item is resolved:
- `ReviewService.evaluatePipelineResume()` queries all review items for the job.
- If **0 blocking review items** remain in `OPEN` or `IN_PROGRESS` state:
  - Processing job status transitions out of `NEEDS_REVIEW` to `APPROVED` / next stage.
  - Processing step `PIPELINE_RESUMED` is recorded.

---

## 8. Audit Trail Events

The following user actions record immutable events in `audit_logs`:
- `REVIEW_CREATED`
- `REVIEW_ASSIGNED`
- `REVIEW_STARTED`
- `CLASSIFICATION_CORRECTED`
- `PAGE_GROUPING_CORRECTED`
- `FIELD_CORRECTED`
- `FIELD_CONFIRMED`
- `VALIDATION_RECHECKED`
- `REVIEW_RESOLVED`
- `REVIEW_REJECTED`
