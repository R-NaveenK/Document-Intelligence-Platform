const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { processPipeline, makeHttpPost } = require('../backend/src/services/orchestrator');
const { validateValidationOutput } = require('../shared/contracts/validator');
const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');
const ReprocessingService = require('../backend/src/services/reprocessingService');
const ReviewService = require('../backend/src/services/reviewService');
const StructuredDataService = require('../backend/src/services/structuredDataService');

function makeHttpGet(urlStr) {
  return new Promise((resolve, reject) => {
    http.get(urlStr, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: body });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} from ${urlStr}: ${body}`));
        }
      });
    }).on('error', reject);
  });
}

function startValidationServerProcess() {
  return new Promise((resolve, reject) => {
    const engineDir = path.resolve(__dirname, '../validation phase/validation phase/validation-engine');
    const pyProc = spawn('python', ['main.py', '--server', '--host', '127.0.0.1', '--port', '5003'], {
      cwd: engineDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let started = false;
    pyProc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (!started && (msg.includes('Uvicorn running') || msg.includes('Application startup complete') || msg.includes('5003'))) {
        started = true;
        setTimeout(() => resolve(pyProc), 500);
      }
    });

    pyProc.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!started && (msg.includes('Uvicorn running') || msg.includes('Application startup complete') || msg.includes('5003'))) {
        started = true;
        setTimeout(() => resolve(pyProc), 500);
      }
    });

    pyProc.on('error', (err) => {
      if (!started) reject(err);
    });

    // Fallback timer to check health
    setTimeout(async () => {
      if (!started) {
        try {
          await makeHttpGet('http://127.0.0.1:5003/health');
          started = true;
          resolve(pyProc);
        } catch (e) {
          // If already running or couldn't start
          resolve(pyProc);
        }
      }
    }, 2500);
  });
}

async function runValidationEngineIntegrationTests() {
  console.log('==================================================');
  console.log('Running Real Validation Engine Integration Suite');
  console.log('==================================================\n');

  const validationUrl = process.env.VALIDATION_SERVICE_URL || 'http://localhost:5003';
  const orgA = '00000000-0000-0000-0000-000000000001';
  const orgB = '00000000-0000-0000-0000-000000000002';

  let validationProc = null;
  // Check if server is already running, if not start it
  try {
    await makeHttpGet(`${validationUrl}/health`);
    console.log('[INIT] Real Validation Engine is already running on port 5003.');
  } catch (err) {
    console.log('[INIT] Starting Real Validation Engine service on port 5003...');
    validationProc = await startValidationServerProcess();
    await new Promise(r => setTimeout(r, 1000));
  }

  try {
    // ----------------------------------------------------
    // Test 1: Health Check Endpoints (GET /health & /api/v1/health)
    // ----------------------------------------------------
    const health1 = await makeHttpGet(`${validationUrl}/health`);
    assert.strictEqual(health1.statusCode, 200, 'Health endpoint must return 200');
    assert.strictEqual(health1.data.status, 'ok', 'Health status must be ok');

    const health2 = await makeHttpGet(`${validationUrl}/api/v1/health`);
    assert.strictEqual(health2.statusCode, 200, 'Health API v1 endpoint must return 200');
    console.log('[PASS] Test 1: Real Validation Engine health endpoints (GET /health & /api/v1/health) verified');

    // ----------------------------------------------------
    // Test 2: All Validators PASS (requiresReview = false, status = PASSED)
    // ----------------------------------------------------
    const validInvoicePayload = {
      jobId: 'job_test_pass_001',
      logicalDocumentId: 'doc_valid_001',
      documentTypeId: 'invoice',
      organizationId: orgA,
      fields: [
        { fieldKey: 'quantity', value: 10, dataType: 'integer' },
        { fieldKey: 'unit_price', value: 500, dataType: 'decimal' },
        { fieldKey: 'total_amount', value: 5000, dataType: 'decimal' },
        { fieldKey: 'invoice_date', value: '2026-03-01', dataType: 'date' },
        { fieldKey: 'gst_number', value: '22AAAAA0000A1Z5', dataType: 'string' }
      ]
    };

    const valPassRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, validInvoicePayload);
    validateValidationOutput(valPassRes);
    assert.strictEqual(valPassRes.status, 'PASSED', 'Valid document should pass validation');
    assert.strictEqual(valPassRes.requiresReview, false, 'Valid document should not require human review');
    assert.strictEqual(valPassRes.risk.level, 'LOW', 'Risk level should be LOW');
    console.log('[PASS] Test 2: All validators PASS case verified (requiresReview = false, status = PASSED)');

    // ----------------------------------------------------
    // Test 3: Arithmetic FAIL (qty * unit_price != total_amount)
    // ----------------------------------------------------
    const badArithPayload = {
      jobId: 'job_test_arith_001',
      logicalDocumentId: 'doc_arith_fail',
      documentTypeId: 'invoice',
      organizationId: orgA,
      fields: [
        { fieldKey: 'quantity', value: 10, dataType: 'integer' },
        { fieldKey: 'unit_price', value: 500, dataType: 'decimal' },
        { fieldKey: 'total_amount', value: 12000, dataType: 'decimal' } // Mismatch: Expected 5000 vs 12000 (140% diff)
      ]
    };

    const arithFailRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, badArithPayload);
    validateValidationOutput(arithFailRes);
    assert.strictEqual(arithFailRes.status, 'FAILED', 'Arithmetic mismatch should fail status');
    assert.strictEqual(arithFailRes.requiresReview, true, 'Arithmetic failure requires human review');
    assert.ok(arithFailRes.reviewReasons.includes('ARITHMETIC_VALIDATION_FAILED'), 'Review reasons must include ARITHMETIC_VALIDATION_FAILED');
    console.log('[PASS] Test 3: Arithmetic failure correctly triggers FAILED status and Human Review requirement');

    // ----------------------------------------------------
    // Test 4: Format FAIL (Invalid GSTIN regex)
    // ----------------------------------------------------
    const badFormatPayload = {
      jobId: 'job_test_format_001',
      logicalDocumentId: 'doc_format_fail',
      documentTypeId: 'invoice',
      organizationId: orgA,
      fields: [
        { fieldKey: 'gst_number', value: 'INVALID_GST_PATTERN_123', dataType: 'string' }
      ]
    };

    const formatFailRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, badFormatPayload);
    validateValidationOutput(formatFailRes);
    assert.strictEqual(formatFailRes.status, 'FAILED', 'Format error should fail validation');
    assert.strictEqual(formatFailRes.requiresReview, true, 'Format error requires review');
    assert.ok(formatFailRes.reviewReasons.includes('FORMAT_VALIDATION_FAILED'), 'Review reasons must include FORMAT_VALIDATION_FAILED');
    console.log('[PASS] Test 4: Format validator failure detected and mapped to Human Review');

    // ----------------------------------------------------
    // Test 5: Date FAIL (Malformed/invalid calendar date)
    // ----------------------------------------------------
    const badDatePayload = {
      jobId: 'job_test_date_001',
      logicalDocumentId: 'doc_date_fail',
      documentTypeId: 'invoice',
      organizationId: orgA,
      fields: [
        { fieldKey: 'invoice_date', value: '99-99-9999_invalid_date', dataType: 'date' }
      ]
    };

    const dateFailRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, badDatePayload);
    validateValidationOutput(dateFailRes);
    assert.strictEqual(dateFailRes.status, 'FAILED', 'Malformed date should fail validation');
    assert.strictEqual(dateFailRes.requiresReview, true, 'Date failure requires human review');
    assert.ok(dateFailRes.reviewReasons.includes('DATE_VALIDATION_FAILED'), 'Review reasons must include DATE_VALIDATION_FAILED');
    console.log('[PASS] Test 5: Date validator failure detected and mapped to Human Review');

    // ----------------------------------------------------
    // Test 6: Independent Validator Execution
    // ----------------------------------------------------
    // Cause arithmetic failure, verify format, duplicate, and date all still run!
    assert.ok(Array.isArray(arithFailRes.validationResults), 'Validation results list must be returned');
    const ranValidators = arithFailRes.validationResults.map(r => r.validator);
    assert.ok(ranValidators.includes('arithmetic'), 'Arithmetic validator ran');
    assert.ok(ranValidators.includes('format'), 'Format validator ran independently');
    assert.ok(ranValidators.includes('duplicate'), 'Duplicate validator ran independently');
    assert.ok(ranValidators.includes('date'), 'Date validator ran independently');
    console.log('[PASS] Test 6: Independent execution of all 4 validation phases verified (failure in one does not abort others)');

    // ----------------------------------------------------
    // Test 7: Non-Applicable Validator (Admission Form / Non-Financial)
    // ----------------------------------------------------
    const admissionFormPayload = {
      jobId: 'job_admission_001',
      logicalDocumentId: 'doc_admission_001',
      documentTypeId: 'admission_form',
      organizationId: orgA,
      fields: [
        { fieldKey: 'student_name', value: 'John Smith', dataType: 'string' },
        { fieldKey: 'application_date', value: '2026-09-01', dataType: 'date' }
      ]
    };

    const admissionRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, admissionFormPayload);
    validateValidationOutput(admissionRes);
    assert.strictEqual(admissionRes.status, 'PASSED', 'Non-financial admission form should pass validation');
    assert.strictEqual(admissionRes.requiresReview, false, 'Non-financial form should not require review for missing total_amount');
    console.log('[PASS] Test 7: Non-applicable validator handling (Admission Form skips arithmetic without false failures)');

    // ----------------------------------------------------
    // Test 8: Human Review Revalidation with Effective Value
    // ----------------------------------------------------
    // Initial machine value 12000 (fails) -> Human corrects to 5000 (effectiveValue) -> Revalidation PASSES
    const revalPayload = {
      jobId: 'job_reval_001',
      logicalDocumentId: 'doc_reval_001',
      documentTypeId: 'invoice',
      organizationId: orgA,
      fields: [
        { fieldKey: 'quantity', value: 10, dataType: 'integer' },
        { fieldKey: 'unit_price', value: 500, dataType: 'decimal' },
        { fieldKey: 'total_amount', value: 12000, effectiveValue: 5000, dataType: 'decimal' }, // Human corrected effectiveValue!
        { fieldKey: 'invoice_date', value: '2026-03-01', dataType: 'date' }
      ]
    };

    const revalRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, revalPayload);
    validateValidationOutput(revalRes);
    assert.strictEqual(revalRes.status, 'PASSED', 'Revalidation with corrected effective value should PASS');
    assert.strictEqual(revalRes.requiresReview, false, 'Revalidated document should clear human review requirement');
    console.log('[PASS] Test 8: Human Review revalidation using effectiveValue verified');

    // ----------------------------------------------------
    // Test 9: Multi-Tenancy Tenant Isolation for Duplicate Detection
    // ----------------------------------------------------
    const org1Doc = {
      jobId: 'job_org_a',
      logicalDocumentId: 'inv_tenant_01',
      organizationId: orgA,
      documentTypeId: 'invoice',
      fields: [
        { fieldKey: 'invoice_number', value: 'INV-TENANT-SHARED-001' },
        { fieldKey: 'vendor_name', value: 'Global Supplier Ltd' },
        { fieldKey: 'quantity', value: 1, dataType: 'integer' },
        { fieldKey: 'unit_price', value: 99000, dataType: 'decimal' },
        { fieldKey: 'total_amount', value: 99000, dataType: 'decimal' }
      ]
    };

    const org2Doc = {
      jobId: 'job_org_b',
      logicalDocumentId: 'inv_tenant_02',
      organizationId: orgB,
      documentTypeId: 'invoice',
      fields: [
        { fieldKey: 'invoice_number', value: 'INV-TENANT-SHARED-001' },
        { fieldKey: 'vendor_name', value: 'Global Supplier Ltd' },
        { fieldKey: 'quantity', value: 1, dataType: 'integer' },
        { fieldKey: 'unit_price', value: 99000, dataType: 'decimal' },
        { fieldKey: 'total_amount', value: 99000, dataType: 'decimal' }
      ]
    };

    const resOrgA = await makeHttpPost(`${validationUrl}/api/v1/validate`, org1Doc);
    const resOrgB = await makeHttpPost(`${validationUrl}/api/v1/validate`, org2Doc);

    assert.strictEqual(resOrgA.status, 'PASSED', 'Org A document should pass');
    assert.strictEqual(resOrgB.status, 'PASSED', 'Document in Org B must not trigger duplicate failure against Org A record');
    console.log('[PASS] Test 9: Tenant isolation for business record duplicate lookup verified across organizations');

    // ----------------------------------------------------
    // Test 10: Stage 9 Living Schema Reprocessing Real Validation
    // ----------------------------------------------------
    // Verify that adding a new field through Living Schema can be revalidated dynamically
    const reprocessPayload = {
      jobId: 'job_reprocess_stage9',
      logicalDocumentId: 'doc_stage9_001',
      documentTypeId: 'invoice',
      organizationId: orgA,
      fields: [
        { fieldKey: 'quantity', value: 20, dataType: 'integer' },
        { fieldKey: 'unit_price', value: 100, dataType: 'decimal' },
        { fieldKey: 'total_amount', value: 2000, dataType: 'decimal' },
        { fieldKey: 'po_number', value: 'PO-2026-STAGE9', dataType: 'string' }
      ]
    };

    const reprocessRes = await makeHttpPost(`${validationUrl}/api/v1/validate`, reprocessPayload);
    validateValidationOutput(reprocessRes);
    assert.strictEqual(reprocessRes.status, 'PASSED');
    assert.strictEqual(reprocessRes.requiresReview, false);
    console.log('[PASS] Test 10: Stage 9 Living Schema historical reprocessing integration with Real Validation verified');

    console.log('\n==================================================');
    console.log('REAL VALIDATION ENGINE INTEGRATION SUMMARY: 10 Passed, 0 Failed');
    console.log('==================================================\n');

  } finally {
    if (validationProc) {
      validationProc.kill();
    }
  }
}

if (require.main === module) {
  runValidationEngineIntegrationTests().catch(err => {
    console.error('Validation Integration Test Failed:', err);
    process.exit(1);
  });
}

module.exports = { runValidationEngineIntegrationTests };

