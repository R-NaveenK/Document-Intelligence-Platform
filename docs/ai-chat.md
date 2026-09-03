# AI Chat Over Documents Architecture (Stage 7)

This document details the natural-language AI Chat interface, restricted JSON query contract, zero raw SQL execution security guarantee, dynamic field/alias resolution, exact database aggregations, prompt injection protections, follow-up conversation context, and Search & Filter UI integration.

---

## 1. Security Architecture (Zero Raw SQL Execution)

To guarantee absolute security and prevent prompt injection or database compromise, the AI Chat engine **never generates or executes raw SQL**.

```
User Natural Language Question
             │
             ▼
 Gemini AI Query Planner (`geminiQueryPlanner.js`)
             │
             ▼
  Restricted Query JSON Contract
             │
             ▼
 Backend Security Validator (`chatQueryValidator.js`)
 └── REJECTS any payload containing "sql": "SELECT..." or raw SQL strings
             │
             ▼
 Safe Parameterized Query Builder (`searchService.js` / `queryBuilder.js`)
             │
             ▼
  PostgreSQL Parameterized Query (`organization_id = $trustedTenant`)
             │
             ▼
 Database Result Grounded Final Answer
```

---

## 2. Restricted JSON Query Contract (`SUPPORTED_INTENTS`)

The AI model produces ONLY structured JSON matching a controlled set of supported intents:

| Intent | Description | Execution Layer |
|---|---|---|
| `SEARCH_RECORDS` | Search approved records by filename, field filters, or text | `SearchService.querySearch()` |
| `COUNT_RECORDS` | Count exact number of matching records | PostgreSQL `COUNT()` |
| `SUM_FIELD` | Calculate exact numerical sum of a field | PostgreSQL `SUM()` |
| `AVG_FIELD` | Calculate exact numerical average of a field | PostgreSQL `AVG()` |
| `MIN_FIELD` | Find minimum numerical or date value | PostgreSQL `MIN()` |
| `MAX_FIELD` | Find maximum numerical or date value | PostgreSQL `MAX()` |
| `GROUP_BY_FIELD` | Controlled grouping by a specific field | Controlled Aggregate Query |
| `CLARIFICATION_REQUIRED` | Returned when natural wording is ambiguous | Frontend Clarification Widget |

---

## 3. Dynamic Field & Alias Resolution (`chatSchemaService.js`)

Users are not expected to know internal database column names (`grand_total`). The `chatSchemaService.js` inspects published profile schemas and resolves terms:
- Display Name: `"Grand Total"` -> `grand_total`
- Alias: `"Bill Amount"` -> `grand_total`
- Ambiguity Check: If multiple candidate fields match, returns `CLARIFICATION_REQUIRED` with options instead of guessing.

---

## 4. Multi-Tenant Scoping & Approved Data Default

- Every AI chat query automatically enforces `organization_id = $trustedTenant` derived from authenticated context (`extractTenantContext`).
- Default query scope targets `status = 'APPROVED'` structured records. Unreviewed draft data is never returned as trusted business data.

---

## 5. Result Grounding & Metric Calculation

- Calculations (`SUM`, `AVG`, `COUNT`) are executed **by PostgreSQL**, NOT by passing thousands of raw text rows into an LLM context!
- The natural-language assistant response is strictly grounded in database calculation outputs.

---

## 6. Follow-Up Conversation Context

Refining queries ("Show records created this month" -> "Only those above 5000") is supported via compact conversation state (`previousIntent`, `previousProfile`, `previousDocumentType`, `previousFilters`). Filters are merged incrementally without re-sending entire historical conversations.
