/**
 * ============================================================================
 * TEMPORARY DEVELOPMENT-ONLY MOCK SERVICE: Structuring Layer
 * ============================================================================
 * NOTICE: This service is a temporary mock providing deterministic test data.
 * It will later be replaced by the teammate's real Structuring engine while
 * preserving the exact same JSON API contract.
 */

const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5002;

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'structuring-mock-service',
    status: 'UP',
    isMock: true,
    timestamp: new Date().toISOString()
  });
});

// Structuring Endpoint complying with shared Structuring Contract
app.post('/api/v1/structure', (req, res) => {
  const { logicalDocumentId = 'logical_doc_001', requiredFields = [] } = req.body || {};

  const structuredFields = requiredFields.length > 0
    ? requiredFields.map(reqField => ({
        fieldKey: reqField.fieldKey,
        value: reqField.fieldKey === 'total_amount' ? '$1,250.00' : 'Example Value',
        normalizedValue: reqField.fieldKey === 'total_amount' ? '1250.00' : 'Example Value',
        confidence: 0.95,
        pageNumber: 1,
        boundingBox: [],
        sourceText: `Extracted source text for ${reqField.fieldKey}`
      }))
    : [
        {
          fieldKey: "example_field",
          value: "Example",
          normalizedValue: "Example",
          confidence: 0.95,
          pageNumber: 1,
          boundingBox: [],
          sourceText: "Example source text"
        }
      ];

  res.json({
    logicalDocumentId: logicalDocumentId,
    fields: structuredFields
  });
});

app.listen(PORT, () => {
  console.log(`[STRUCTURING MOCK SERVICE] Running on port ${PORT}`);
});
