# Structured Data Storage Architecture (Stage 6)

This document details the persistent structured storage layer, typed field columns (`value_text`, `value_integer`, `value_decimal`, `value_date`, `value_datetime`, `value_boolean`), single-source-of-truth effective value calculation, machine vs. human value separation, and source evidence traceability.

---

## 1. Storage Architecture Overview

```
Validated / Human-Reviewed Logical Document
                    │
                    ▼
   `StructuredDataService.createStructuredRecord()`
                    │
                    ▼
     `structured_records` Table Record
                    │
   ┌────────────────┴────────────────┐
   ▼                                 ▼
`field_values` Table             `validation_results` Table
- Machine Value                  - Validation Category
- Human Value                    - Pass/Fail Result
- Effective Value                - Rule Message Snapshot
- Typed Value Columns
- Bounding Box & Source OCR Text
```

---

## 2. Effective Value Rule (`StructuredDataService.calculateEffectiveValue`)

To prevent inconsistent logic across frontend and backend, effective value calculation is centralized:

```text
effectiveValue = (humanValue !== null && humanValue !== undefined) ? humanValue : machineValue
```

Original machine values (`machineValue`, `machineConfidence`) are **never deleted or overwritten** when a human reviewer submits a correction.

---

## 3. Typed Storage Columns

To allow mathematical (`amount > 5000`) and date range (`date between X and Y`) filtering rather than fragile string comparison, values are normalized into dedicated typed columns based on the field definition data type:

| Field Data Type | Primary Typed Column | Example Source | Normalized Storage |
|---|---|---|---|
| `string` | `value_text` | `"Acme Corp"` | `"Acme Corp"` |
| `integer` | `value_integer` | `"42"` | `42` |
| `decimal` | `value_decimal` | `"$7,500.50"` | `7500.50` |
| `date` | `value_date` | `"2026-08-15"` | `'2026-08-15'` |
| `datetime` | `value_datetime` | `"2026-08-15T10:30:00Z"` | `'2026-08-15T10:30:00Z'` |
| `boolean` | `value_boolean` | `"true" / "yes" / "1"` | `true` |

---

## 4. Source Evidence Traceability

For every extracted field, the system records complete evidence back to the original document:
- `page_number`: Source page index.
- `source_text`: Exact raw text snippet extracted by OCR.
- `bounding_box`: Normalised bounding box coordinates `[ymin, xmin, ymax, xmax]`.
- `reviewed` / `reviewed_by` / `reviewed_at`: Audit metadata for human corrections.

---

## 5. Structured Record Approval Criteria

A structured record transitions to `status = 'APPROVED'` **ONLY** when:
1. Document classification is resolved.
2. All required fields are present and valid.
3. No blocking human review items remain.
4. All validation checks pass.

Once approved:
- `processing_jobs.status` -> `APPROVED`
- `logical_documents.status` -> `APPROVED`
- `structured_records.status` -> `APPROVED`
