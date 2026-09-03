const http = require('http');
const https = require('https');
const { PROCESSING_STATUS } = require('../../../shared/constants/statuses');
const {
  validateExtractionOutput,
  validateClassifierOutput,
  validateStructuringOutput,
  validateValidationOutput
} = require('../../../shared/contracts/validator');

/**
 * Helper to perform HTTP POST requests using native http module to avoid extra dependencies
 */
function makeHttpPost(urlStr, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = JSON.stringify(payload);
    const lib = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response from ${urlStr}: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} from ${urlStr}: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`Timeout connecting to ${urlStr}`));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Orchestrate the document processing pipeline
 */
async function processPipeline(jobId = 'job_001', fileId = 'file_001') {
  const stepsLog = [];
  let currentStatus = PROCESSING_STATUS.UPLOADED;

  const extractionUrl = process.env.EXTRACTION_SERVICE_URL || 'http://localhost:5001';
  const classifierUrl = process.env.CLASSIFIER_SERVICE_URL || 'http://localhost:8000';
  const structuringUrl = process.env.STRUCTURING_SERVICE_URL || 'http://localhost:5002';
  const validationUrl = process.env.VALIDATION_SERVICE_URL || 'http://localhost:5003';

  try {
    // Step 1: Preprocessing, Multi-Engine Extraction & Comparison Scoring
    currentStatus = PROCESSING_STATUS.EXTRACTING;
    const startExtraction = Date.now();
    let extractionResult;
    try {
      const ComparisonEngine = require('./comparisonEngine');
      const compRes = await ComparisonEngine.runExtractionAndComparison({
        buffer: Buffer.from(`Sample Invoice Document #INV-9021\nTotal Amount: $4,500.00\nDate: 2026-09-03\nDue Date: 2026-09-18\nVendor: Global Logistics Corp`),
        filename: `${fileId}.pdf`,
        mimeType: 'application/pdf',
        jobId,
        documentId: fileId
      });
      extractionResult = {
        jobId,
        fileId,
        pages: (compRes.winningExtraction.pages || []).map(p => ({
          pageNumber: p.pageNumber || 1,
          text: p.text || '',
          ocrConfidence: p.ocrConfidence !== undefined ? p.ocrConfidence : (p.confidence !== undefined ? p.confidence : 0.90),
          confidence: p.confidence !== undefined ? p.confidence : 0.90
        })),
        winningEngine: compRes.winner.engineName,
        winningScore: compRes.winner.totalScore,
        comparison: compRes.comparisonReport
      };
    } catch (e) {
      extractionResult = await makeHttpPost(`${extractionUrl}/api/v1/extract`, { jobId, fileId });
    }
    validateExtractionOutput(extractionResult);
    stepsLog.push({
      step: 'EXTRACTION',
      status: 'SUCCESS',
      durationMs: Date.now() - startExtraction,
      winningEngine: extractionResult.winningEngine || 'Engine 1',
      winningScore: extractionResult.winningScore || 90,
      data: extractionResult
    });

    // Step 2: Hybrid Classification (Schema-driven)
    currentStatus = PROCESSING_STATUS.CLASSIFYING;
    const startClassify = Date.now();

    // Fetch profile and allowed document types for schema-driven classification
    const ProfileService = require('./profileService');
    let allowedTypes = [
      {
        documentTypeId: "type_001",
        name: "Invoice",
        key: "invoice",
        description: "Commercial invoice document",
        aliases: ["Vendor Invoice", "Bill"]
      }
    ];

    try {
      const profileConfig = await ProfileService.getClassifierConfig('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');
      if (profileConfig && profileConfig.documentTypes && profileConfig.documentTypes.length > 0) {
        allowedTypes = profileConfig.documentTypes;
      }
    } catch (e) {
      // Standalone test fallback
    }

    const classifierPayload = {
      jobId: extractionResult.jobId,
      fileId: extractionResult.fileId,
      pages: extractionResult.pages,
      allowedDocumentTypes: allowedTypes
    };

    const classifierResult = await makeHttpPost(`${classifierUrl}/api/v1/classify`, classifierPayload);
    validateClassifierOutput(classifierResult);
    stepsLog.push({
      step: 'CLASSIFICATION',
      status: 'SUCCESS',
      durationMs: Date.now() - startClassify,
      data: classifierResult
    });

    // Step 3: Structuring Layer
    currentStatus = PROCESSING_STATUS.STRUCTURING;
    const pageGroup = classifierResult.pageGroups[0] || {};
    const startStructuring = Date.now();
    const structuringResult = await makeHttpPost(`${structuringUrl}/api/v1/structure`, {
      logicalDocumentId: pageGroup.logicalDocumentId || 'logical_doc_001',
      documentTypeId: pageGroup.documentTypeId || 'type_001',
      schemaVersion: 1,
      pages: pageGroup.pages || [1],
      requiredFields: [
        { fieldKey: 'invoice_number', dataType: 'string' },
        { fieldKey: 'total_amount', dataType: 'number' }
      ]
    });
    validateStructuringOutput(structuringResult);
    stepsLog.push({
      step: 'STRUCTURING',
      status: 'SUCCESS',
      durationMs: Date.now() - startStructuring,
      data: structuringResult
    });

    // Step 4: Validation Engine
    currentStatus = PROCESSING_STATUS.VALIDATING;
    const startValidation = Date.now();
    const validationResult = await makeHttpPost(`${validationUrl}/api/v1/validate`, {
      logicalDocumentId: structuringResult.logicalDocumentId,
      fields: structuringResult.fields
    });
    validateValidationOutput(validationResult);
    stepsLog.push({
      step: 'VALIDATION',
      status: 'SUCCESS',
      durationMs: Date.now() - startValidation,
      data: validationResult
    });

    currentStatus = validationResult.requiresReview ? PROCESSING_STATUS.NEEDS_REVIEW : PROCESSING_STATUS.APPROVED;

    return {
      jobId,
      fileId,
      finalStatus: currentStatus,
      steps: stepsLog,
      validation: validationResult
    };

  } catch (err) {
    console.error(`[ORCHESTRATOR ERROR] Pipeline failed at status ${currentStatus}:`, err.message);
    return {
      jobId,
      fileId,
      finalStatus: PROCESSING_STATUS.FAILED,
      failedAtState: currentStatus,
      error: err.message,
      steps: stepsLog
    };
  }
}

module.exports = {
  processPipeline,
  makeHttpPost
};
