/**
 * ============================================================================
 * TEMPORARY DEVELOPMENT-ONLY MOCK SERVICE: Validation Engine
 * ============================================================================
 * NOTICE: This service is a temporary mock providing deterministic test data.
 * It will later be replaced by the teammate's real Validation engine while
 * preserving the exact same JSON API contract.
 */

const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5003;

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'validation-mock-service',
    status: 'UP',
    isMock: true,
    timestamp: new Date().toISOString()
  });
});

// Validation Endpoint complying with shared Validation Contract
app.post('/api/v1/validate', (req, res) => {
  const { logicalDocumentId = 'logical_doc_001', fields = [] } = req.body || {};

  const validationResults = fields.length > 0
    ? fields.map(f => ({
        type: "FORMAT",
        fieldKey: f.fieldKey,
        passed: true,
        message: null
      }))
    : [
        {
          type: "FORMAT",
          fieldKey: "example_field",
          passed: true,
          message: null
        }
      ];

  res.json({
    logicalDocumentId: logicalDocumentId,
    status: "PASSED",
    validationResults: validationResults,
    requiresReview: false
  });
});

app.listen(PORT, () => {
  console.log(`[VALIDATION MOCK SERVICE] Running on port ${PORT}`);
});
