# Hybrid Document Classifier Architecture & Page Grouping (Stage 4)

This document details the multi-signal classification architecture, RapidFuzz similarity matching, structured Gemini AI fallback, hybrid confidence calculation, page boundary detection, and logical document page grouping.

---

## 1. Classification Architecture Overview

```
Extraction Output (Pages & OCR Text)
                 │
                 ▼
Fetch Allowed Document Types from Job's Frozen Schema Version
                 │
                 ▼
Page-by-Page Signal Processing:
 ├── 1. Normalized Exact & Keyword Matching
 ├── 2. RapidFuzz Similarity Matching
 └── 3. Gemini AI Structured Fallback (Only if local confidence < threshold)
                 │
                 ▼
Weighted Hybrid Confidence Calculation & OCR Confidence Penalty
                 │
                 ▼
Page Boundary Detection (STARTS_NEW_DOCUMENT / CONTINUES_PREVIOUS_DOCUMENT)
                 │
                 ▼
Logical Document Page Grouping (Groups consecutive pages into distinct logical units)
                 │
                 ▼
Human Review Evaluation (Triggers `NEEDS_REVIEW` if confidence < threshold or UNKNOWN)
```

---

## 2. Multi-Signal Scoring Methodology

### Signal 1: Normalized Exact & Keyword Matching (`rules.py`)
- Normalizes text: lowercasing, punctuation removal, whitespace cleanup.
- Matches against document type `name` (0.95 score), `key` (0.90 score), `aliases` (0.90 score), and `description` key phrases.

### Signal 2: RapidFuzz Similarity Matching (`fuzzy.py`)
- Employs RapidFuzz `partial_ratio` and `token_set_ratio` to compare page OCR text against document type names, aliases, and descriptions.
- Handles minor OCR errors, typos, and format variations.

### Signal 3: Gemini AI Structured Fallback (`gemini_client.py`)
- Triggered only when local confidence is below `CLASSIFICATION_HIGH_CONFIDENCE_THRESHOLD` (or when `GEMINI_ENABLED=true`).
- System prompt constrains Gemini to return a structured JSON object containing ONLY allowed `documentTypeId`s or `"UNKNOWN"`.
- Validates JSON output safely; if Gemini returns an invalid ID or fails, the service falls back gracefully without failing the job.

### Hybrid Score Formula (`scoring.py`)
```text
Hybrid Confidence = (KeywordScore * KEYWORD_WEIGHT) + (FuzzyScore * FUZZY_WEIGHT) + (AIScore * AI_WEIGHT)
```
Default Weights:
- `CLASSIFIER_KEYWORD_WEIGHT` = 0.40
- `CLASSIFIER_FUZZY_WEIGHT` = 0.40
- `CLASSIFIER_AI_WEIGHT` = 0.20

### OCR Confidence Penalty
If page `ocrConfidence < 0.80`, classification confidence is reduced proportionally (`ocr_factor = max(0.2, ocr_confidence / 0.80)`).

---

## 3. Page Boundary Detection & Logical Document Grouping

### Boundary Detection (`boundary.py`)
Determines whether each page:
- `STARTS_NEW_DOCUMENT`: Page 1, document type change, or strong first-page keyword indicators (`"Page 1 of"`, `"Invoice #"`, `"Receipt #"`).
- `CONTINUES_PREVIOUS_DOCUMENT`: Same document type as previous page with sequence continuity.
- `UNKNOWN_BOUNDARY`: Page with low confidence or `UNKNOWN` document type.

### Logical Document Grouping (`grouping.py`)
**CRITICAL RULE**: Pages of the same document type are **NOT** automatically merged into one document.
Example:
- Pages 1–2: Invoice (Logical Document A)
- Page 3: Receipt (Logical Document B)
- Pages 4–5: Invoice (Logical Document C)

The grouping engine constructs 3 distinct logical document records:
- Logical Document 1: Pages [1, 2] -> Invoice
- Logical Document 2: Pages [3] -> Receipt
- Logical Document 3: Pages [4, 5] -> Invoice (NOT merged with Pages 1–2!)

---

## 4. Human Review Triggers & Review Reasons

When `requiresReview = true`, the processing job transitions to `NEEDS_REVIEW`.

### Explicit Review Reasons:
- `LOW_CLASSIFICATION_CONFIDENCE`: Confidence below `CLASSIFICATION_REVIEW_THRESHOLD`.
- `UNKNOWN_DOCUMENT_TYPE`: Page could not be matched to any allowed document type.
- `AMBIGUOUS_DOCUMENT_TYPE`: Multiple document types scored very close to each other.
- `UNCERTAIN_PAGE_BOUNDARY`: Boundary between consecutive pages is ambiguous.
- `CLASSIFIER_DISAGREEMENT`: Rule classifier and Gemini AI disagreed strongly.
- `INSUFFICIENT_PAGE_CONTENT`: Page text is empty or less than 5 characters.

---

## 5. Configuration Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `CLASSIFICATION_HIGH_CONFIDENCE_THRESHOLD` | `0.85` | Confidence score required for automatic acceptance |
| `CLASSIFICATION_REVIEW_THRESHOLD` | `0.70` | Confidence threshold triggering `NEEDS_REVIEW` |
| `CLASSIFIER_KEYWORD_WEIGHT` | `0.40` | Weight assigned to exact/keyword normalized signal |
| `CLASSIFIER_FUZZY_WEIGHT` | `0.40` | Weight assigned to RapidFuzz similarity signal |
| `CLASSIFIER_AI_WEIGHT` | `0.20` | Weight assigned to Gemini AI fallback signal |
| `GEMINI_ENABLED` | `false` | Enable/disable Gemini AI calls |
| `GEMINI_API_KEY` | `""` | Gemini API Key |
| `OCR_CONFIDENCE_WEIGHT` | `0.15` | Weight penalty for low OCR confidence |
