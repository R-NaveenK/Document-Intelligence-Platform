/**
 * ============================================================================
 * TEMPORARY DEVELOPMENT-ONLY MOCK SERVICE: Preprocessing & Extraction
 * ============================================================================
 * NOTICE: This service is a temporary mock providing deterministic test data.
 * It will later be replaced by the teammate's real OCR/Extraction engine while
 * preserving the exact same JSON API contract.
 */

const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5001;

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'extraction-mock-service',
    status: 'UP',
    isMock: true,
    timestamp: new Date().toISOString()
  });
});

// Extraction Endpoint complying with shared Extraction Contract
app.post('/api/v1/extract', (req, res) => {
  const { jobId = 'job_001', fileId = 'file_001' } = req.body || {};

  const extractionResponse = {
    jobId: jobId,
    fileId: fileId,
    pages: [
      {
        pageNumber: 1,
        text: "INVOICE #INV-2026-089\nDate: 2026-08-15\nVendor: Acme Corp\nTotal Amount: $1,250.00",
        ocrConfidence: 0.94,
        tables: [],
        boundingBoxes: []
      }
    ]
  };

  res.json(extractionResponse);
});

app.listen(PORT, () => {
  console.log(`[EXTRACTION MOCK SERVICE] Running on port ${PORT}`);
});
