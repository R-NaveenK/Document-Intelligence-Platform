/**
 * End-to-End Pipeline Integration Test
 * Verifies JSON data flow:
 * Express Backend -> Mock Extraction -> Classifier Placeholder -> Mock Structuring -> Mock Validation
 */

const http = require('http');
const express = require('express');
const { processPipeline } = require('../backend/src/services/orchestrator');
const { validateExtractionOutput, validateClassifierOutput, validateStructuringOutput, validateValidationOutput } = require('../shared/contracts/validator');

// Helper to launch in-process temporary servers if external servers are not running
function createMockServer(port, route, responseData) {
  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ status: 'UP' }));
  app.post(route, (req, res) => res.json(responseData(req.body)));
  return new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
}

async function runIntegrationTest() {
  console.log('==================================================');
  console.log('Starting Pipeline Integration Test');
  console.log('Flow: Express -> Mock Extraction -> Classifier -> Mock Structuring -> Mock Validation');
  console.log('==================================================\n');

  let serversToClose = [];

  // Start in-process servers if not running externally
  try {
    const s1 = await createMockServer(5001, '/api/v1/extract', (body) => ({
      jobId: body.jobId || 'test_job_101',
      fileId: body.fileId || 'test_file_101',
      pages: [{ pageNumber: 1, text: 'INVOICE #1001 Total $500', ocrConfidence: 0.98, tables: [], boundingBoxes: [] }]
    }));
    serversToClose.push(s1);

    const s2 = await createMockServer(8000, '/api/v1/classify', (body) => ({
      jobId: body.jobId,
      fileId: body.fileId,
      pageGroups: [{
        logicalDocumentId: 'logical_doc_101',
        documentTypeId: 'type_invoice',
        documentType: 'INVOICE',
        pages: [1],
        classificationConfidence: 0.99,
        requiresReview: false
      }]
    }));
    serversToClose.push(s2);

    const s3 = await createMockServer(5002, '/api/v1/structure', (body) => ({
      logicalDocumentId: body.logicalDocumentId,
      fields: [
        { fieldKey: 'invoice_number', value: '1001', normalizedValue: '1001', confidence: 0.98, pageNumber: 1, boundingBox: [], sourceText: '1001' },
        { fieldKey: 'total_amount', value: '$500', normalizedValue: '500.00', confidence: 0.97, pageNumber: 1, boundingBox: [], sourceText: '$500' }
      ]
    }));
    serversToClose.push(s3);

    const s4 = await createMockServer(5003, '/api/v1/validate', (body) => ({
      logicalDocumentId: body.logicalDocumentId,
      status: 'PASSED',
      validationResults: [
        { type: 'FORMAT', fieldKey: 'invoice_number', passed: true, message: null },
        { type: 'FORMAT', fieldKey: 'total_amount', passed: true, message: null }
      ],
      requiresReview: false
    }));
    serversToClose.push(s4);

    console.log('[INIT] Test microservice endpoints initialized.');
  } catch (err) {
    console.log('[INIT] Using existing running microservices.');
  }

  try {
    const testJobId = 'job_test_' + Date.now();
    const testFileId = 'file_test_' + Date.now();

    console.log(`[TEST] Triggering pipeline process for Job: ${testJobId}, File: ${testFileId}`);
    
    const result = await processPipeline(testJobId, testFileId);

    console.log('\n--------------------------------------------------');
    console.log(`[RESULT] Final Processing Status: ${result.finalStatus}`);
    console.log(`[RESULT] Steps Completed: ${result.steps.length}`);
    console.log('--------------------------------------------------');

    let allContractsValid = true;

    result.steps.forEach((s, idx) => {
      console.log(`Step ${idx + 1}: ${s.step} [${s.status}] (${s.durationMs}ms)`);
      if (s.step === 'EXTRACTION') validateExtractionOutput(s.data);
      if (s.step === 'CLASSIFICATION') validateClassifierOutput(s.data);
      if (s.step === 'STRUCTURING') validateStructuringOutput(s.data);
      if (s.step === 'VALIDATION') validateValidationOutput(s.data);
    });

    if (result.finalStatus === 'APPROVED' || result.finalStatus === 'NEEDS_REVIEW') {
      console.log('\n==================================================');
      console.log('SUCCESS: E2E Pipeline JSON flow and contract validations passed!');
      console.log('==================================================');
    } else {
      console.error('\nFAILED: Pipeline execution did not complete successfully.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\nFATAL ERROR during integration test:', err.message);
    process.exitCode = 1;
  } finally {
    serversToClose.forEach(server => server.close());
  }
}

if (require.main === module) {
  runIntegrationTest();
}

module.exports = { runIntegrationTest };
