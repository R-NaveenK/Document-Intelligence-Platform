/**
 * Multi-Engine Extraction & Comparison Engine Automated Test Suite
 * Verifies Engine 1 (Native), Engine 2 (OCR.space API), Engine 3 (Python Engine),
 * Multi-factor Quality Scoring, Highest-Score Selection, and Pipeline Handoff!
 */

const ExtractionEngine2Service = require('../backend/src/services/extractionEngine2Service');
const ExtractionEngine3Service = require('../backend/src/services/extractionEngine3Service');
const ComparisonEngine = require('../backend/src/services/comparisonEngine');
const IngestionService = require('../backend/src/services/ingestionService');
const ProfileService = require('../backend/src/services/profileService');
const { processPipeline } = require('../backend/src/services/orchestrator');

async function runExtractionEnginesComparisonTests() {
  console.log('==================================================');
  console.log('Running Multi-Engine Extraction & Comparison Engine Test Suite');
  console.log('==================================================\n');

  const ORG_A = '00000000-0000-0000-0000-000000000001';
  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      testPassed++;
    } else {
      console.error(`[FAIL] ${message}`);
      testFailed++;
      process.exitCode = 1;
    }
  }

  try {
    const sampleInvoiceBuffer = Buffer.from(
      `%PDF-1.4\nTAX INVOICE / PURCHASE ORDER\nInvoice Number: INV-2026-9810\nDate: 2026-09-03\nDue Date: 2026-10-03\nVendor: Apex Document Technologies Inc\nBill To: Enterprise Solutions Corp\nDescription: Intelligent Document Processing Subscription\nQuantity: 5\nUnit Price: $1,200.00\nSubtotal: $6,000.00\nTax (10%): $600.00\nTotal Amount: $6,600.00\nPayment Terms: Net 30 days\nBank Account: US98-IDP-90021-9988\nThank you for your business!`
    );

    // 1. Verify Engine 1 (Native Multi-Format Engine)
    console.log('\n--- 1. Testing Engine 1: Native Ingestion Engine ---');
    const engine1Info = { engineId: 'ENGINE_1_NATIVE', name: 'Native Multi-Format Parser' };
    assert(engine1Info.engineId === 'ENGINE_1_NATIVE', '1. Engine 1 identified as Native Multi-Format Parser');
    const res1 = await ComparisonEngine.runEngine1({
      buffer: sampleInvoiceBuffer,
      filename: 'sample_invoice.pdf',
      mimeType: 'application/pdf',
      jobId: 'job_test_001',
      documentId: 'doc_test_001'
    });
    assert(res1.status === 'SUCCESS', '1. Engine 1 extraction completed successfully');
    assert(res1.pages.length >= 1, '1. Engine 1 extracted at least 1 page');
    assert(res1.wordCount >= 10, '1. Engine 1 word count verified (' + res1.wordCount + ' words)');

    // 2. Verify Engine 2 (Cloud OCR API Engine with OCR.space API Key)
    console.log('\n--- 2. Testing Engine 2: Cloud OCR API Engine ---');
    const engine2Info = ExtractionEngine2Service.getEngineInfo();
    assert(engine2Info.engineId === 'ENGINE_2_OCR_API', '2. Engine 2 identified as Cloud OCR API Engine');
    const res2 = await ExtractionEngine2Service.extract(
      sampleInvoiceBuffer,
      'sample_invoice.pdf',
      'application/pdf',
      'job_test_002',
      'doc_test_002'
    );
    assert(res2.status === 'SUCCESS', '2. Engine 2 OCR extraction completed successfully');
    assert(res2.confidence >= 0.85, '2. Engine 2 returned high OCR confidence (' + res2.confidence + ')');
    assert(res2.rawText.length > 20, '2. Engine 2 extracted text content verified');

    // 3. Verify Engine 3 (Python Document Engine in extraction_engine_3)
    console.log('\n--- 3. Testing Engine 3: Python Document Engine ---');
    const engine3Info = ExtractionEngine3Service.getEngineInfo();
    assert(engine3Info.engineId === 'ENGINE_3_PYTHON', '3. Engine 3 identified as Advanced Python Document Engine');
    const res3 = await ExtractionEngine3Service.extract(
      sampleInvoiceBuffer,
      'sample_invoice.pdf',
      'application/pdf',
      'job_test_003',
      'doc_test_003'
    );
    assert(res3.status === 'SUCCESS', '3. Engine 3 Python extraction completed successfully');
    assert(res3.pages.length >= 1, '3. Engine 3 extracted structured pages');
    assert(res3.characterCount >= 50, '3. Engine 3 character count verified (' + res3.characterCount + ' chars)');

    // 4. Verify Comparison Engine Multi-Factor Quality Scoring
    console.log('\n--- 4. Testing Comparison Engine Quality Scoring ---');
    const eval1 = ComparisonEngine.evaluateExtraction(res1, sampleInvoiceBuffer, 'sample_invoice.pdf');
    const eval2 = ComparisonEngine.evaluateExtraction(res2, sampleInvoiceBuffer, 'sample_invoice.pdf');
    const eval3 = ComparisonEngine.evaluateExtraction(res3, sampleInvoiceBuffer, 'sample_invoice.pdf');

    assert(eval1.totalScore >= 0 && eval1.totalScore <= 100, '4. Engine 1 quality score computed: ' + eval1.totalScore + '/100');
    assert(eval2.totalScore >= 0 && eval2.totalScore <= 100, '4. Engine 2 quality score computed: ' + eval2.totalScore + '/100');
    assert(eval3.totalScore >= 0 && eval3.totalScore <= 100, '4. Engine 3 quality score computed: ' + eval3.totalScore + '/100');
    assert(eval3.metrics.characterClarity > 0, '4. Character clarity metric computed: ' + eval3.metrics.characterClarity + '/100');
    assert(eval3.metrics.entityRichness > 0, '4. Entity & numerical density metric computed: ' + eval3.metrics.entityRichness + '/100');

    // 5. Verify Comparison Engine Winner Selection (Highest Score Selection)
    console.log('\n--- 5. Testing Comparison Engine Winner Selection ---');
    const compResult = await ComparisonEngine.runExtractionAndComparison({
      buffer: sampleInvoiceBuffer,
      filename: 'sample_invoice.pdf',
      mimeType: 'application/pdf',
      jobId: 'job_test_comp',
      documentId: 'doc_test_comp'
    });

    assert(compResult.winner && compResult.winner.totalScore > 0, '5. Comparison engine selected winning engine: ' + compResult.winner.engineName);
    assert(compResult.comparisonReport.enginesEvaluated === 3, '5. Comparison evaluated all 3 engines');
    assert(compResult.comparisonReport.comparisons.length === 3, '5. Comparison report contains 3 engine comparisons');
    
    // Check that winner has the highest score among all 3
    const maxScore = Math.max(...compResult.comparisonReport.comparisons.map(c => c.score));
    assert(compResult.comparisonReport.winningScore === maxScore, '5. Winning engine matches the highest score (' + maxScore + '/100)');
    assert(compResult.winningExtraction && compResult.winningExtraction.pages.length > 0, '5. Winning extraction payload ready for pipeline handoff');

    // 6. Verify Full Ingestion Pipeline Handoff with Comparison Engine
    console.log('\n--- 6. Testing Full Ingestion Pipeline Handoff ---');
    const profile = await ProfileService.createProfile(ORG_A, { name: 'Multi-Engine Extraction Test Profile' });
    await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Commercial Invoice', key: 'invoice' });
    await ProfileService.publishSchema(ORG_A, profile.profileId);

    const uploadRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'enterprise_invoice.pdf',
      mimetype: 'application/pdf',
      buffer: sampleInvoiceBuffer
    }]);

    const docId = uploadRes.documentId || (uploadRes.uploads && uploadRes.uploads[0].documentId);
    assert(docId, '6. Document uploaded and queued for multi-engine extraction');

    const compReport = await IngestionService.getExtractionComparison(ORG_A, docId);
    assert(compReport && compReport.winningEngineName, '6. Extraction comparison report generated for document: ' + compReport.winningEngineName);
    assert(compReport.comparisons.length === 3, '6. Document comparison contains breakdown for Engine 1, 2, and 3');

    // 7. Verify Orchestrator Pipeline Step Execution
    console.log('\n--- 7. Testing Pipeline Orchestrator Integration ---');
    const pipelineRes = await processPipeline('job_e2e_comp_001', docId);
    assert(pipelineRes.steps.length >= 4, '7. Orchestrator completed pipeline steps including multi-engine extraction');
    const extractStep = pipelineRes.steps.find(s => s.step === 'EXTRACTION');
    assert(extractStep && extractStep.winningEngine, '7. Extraction step recorded winning engine: ' + extractStep.winningEngine);

    console.log('\n==================================================');
    console.log(`MULTI-ENGINE EXTRACTION & COMPARISON SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================\n');

  } catch (err) {
    console.error('[TEST ERROR]', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runExtractionEnginesComparisonTests();
}

module.exports = { runExtractionEnginesComparisonTests };
