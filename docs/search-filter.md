# Search & Dynamic Filter Architecture (Stage 6)

This document details the PostgreSQL full-text search engine, parameterized query builder, typed filter operators, SQL injection security protections, and multi-tenant tenant isolation.

---

## 1. PostgreSQL Full-Text Search Architecture

The platform utilizes PostgreSQL `tsvector` and `GIN` indexing to deliver high-performance search across dynamic document profiles without requiring third-party search engines.

### Weighted Search Vector (`search_vector`)
1. **Weight A**: Document type name & critical key identifiers.
2. **Weight B**: Effective field values (`value_text`).
3. **Weight C**: Original filename.
4. **Weight D**: Raw page OCR text.

---

## 2. Dynamic Query Builder & Parameterization (`queryBuilder.js`)

Users can execute dynamic multi-filter queries via `POST /api/v1/search/query`:

```json
{
  "profileId": "prof_uuid_123",
  "documentTypeId": "dt_uuid_456",
  "search": "container",
  "filters": [
    { "fieldKey": "total_amount", "operator": "greater_than", "value": 5000 },
    { "fieldKey": "invoice_date", "operator": "between", "valueMin": "2026-01-01", "valueMax": "2026-12-31" }
  ],
  "sort": { "field": "createdAt", "direction": "desc" },
  "page": 1,
  "limit": 20
}
```

---

## 3. Typed Filter Operators Allowlist

To ensure query security, operators are strictly validated against field data types:

| Data Type | Allowed Operators |
|---|---|
| `string` | `equals`, `not_equals`, `contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty` |
| `integer` / `decimal` | `equals`, `not_equals`, `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`, `between` |
| `date` / `datetime` | `equals`, `before`, `after`, `between` |
| `boolean` | `equals` |

Any request supplying an operator outside the allowlist for that data type is rejected with error code `UNSUPPORTED_OPERATOR`.

---

## 4. Security Protections & SQL Injection Defense

1. **Strict Parameterization**: No user strings are concatenated directly into raw SQL strings.
2. **Field Key Sanitization**: `fieldKey` input is validated against regex `^[a-zA-Z0-9_-]+$`. Malicious payloads (e.g. `' OR 1=1 --`, `DROP TABLE`) are rejected immediately with `INVALID_FIELD_KEY`.
3. **Tenant Isolation**: Every query automatically enforces `organization_id = $trustedTenant` derived from verified backend context (`extractTenantContext`). Cross-tenant access attempts return 0 results or 403 Forbidden.
