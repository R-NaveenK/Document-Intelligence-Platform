# API Contracts & Service Specifications

This document defines the strict JSON contracts exchanged between the Express Backend API Gateway and the individual microservices.

---

## 1. Extraction Service Contract

- **Endpoint**: `POST /api/v1/extract`
- **Provided by**: Teammate Preprocessing & Extraction Service / Mock

### Request Payload
```json
{
  "jobId": "job_001",
  "fileId": "file_001"
}
```

### Response Contract
```json
{
  "jobId": "job_001",
  "fileId": "file_001",
  "pages": [
    {
      "pageNumber": 1,
      "text": "INVOICE #INV-2026-089\nDate: 2026-08-15\nVendor: Acme Corp\nTotal Amount: $1,250.00",
      "ocrConfidence": 0.94,
      "tables": [],
      "boundingBoxes": []
    }
  ]
}
```

---

## 2. Hybrid Classifier Service Contract

- **Endpoint**: `POST /api/v1/classify`
- **Provided by**: Python FastAPI Classifier Service

### Request Payload
```json
{
  "jobId": "job_001",
  "fileId": "file_001",
  "pages": [
    {
      "pageNumber": 1,
      "text": "raw extracted text..."
    }
  ]
}
```

### Response Contract
```json
{
  "jobId": "job_001",
  "fileId": "file_001",
  "pageGroups": [
    {
      "logicalDocumentId": "logical_doc_001",
      "documentTypeId": "type_001",
      "documentType": "INVOICE",
      "pages": [1],
      "classificationConfidence": 0.96,
      "requiresReview": false
    }
  ]
}
```

---

## 3. Structuring Service Contract

- **Endpoint**: `POST /api/v1/structure`
- **Provided by**: Teammate Structuring Service / Mock

### Request Payload
```json
{
  "logicalDocumentId": "logical_doc_001",
  "documentTypeId": "type_001",
  "schemaVersion": 1,
  "pages": [1],
  "requiredFields": [
    {
      "fieldKey": "invoice_number",
      "dataType": "string"
    },
    {
      "fieldKey": "total_amount",
      "dataType": "number"
    }
  ]
}
```

### Response Contract
```json
{
  "logicalDocumentId": "logical_doc_001",
  "fields": [
    {
      "fieldKey": "invoice_number",
      "value": "INV-2026-089",
      "normalizedValue": "INV-2026-089",
      "confidence": 0.95,
      "pageNumber": 1,
      "boundingBox": [],
      "sourceText": "Extracted source text for invoice_number"
    },
    {
      "fieldKey": "total_amount",
      "value": "$1,250.00",
      "normalizedValue": "1250.00",
      "confidence": 0.95,
      "pageNumber": 1,
      "boundingBox": [],
      "sourceText": "Extracted source text for total_amount"
    }
  ]
}
```

---

## 4. Validation Engine Contract

- **Endpoint**: `POST /api/v1/validate`
- **Provided by**: Teammate Validation Engine / Mock

### Request Payload
```json
{
  "logicalDocumentId": "logical_doc_001",
  "fields": [
    {
      "fieldKey": "invoice_number",
      "value": "INV-2026-089"
    }
  ]
}
```

### Response Contract
```json
{
  "logicalDocumentId": "logical_doc_001",
  "status": "PASSED",
  "validationResults": [
    {
      "type": "FORMAT",
      "fieldKey": "invoice_number",
      "passed": true,
      "message": null
    }
  ],
  "requiresReview": false
}
```
