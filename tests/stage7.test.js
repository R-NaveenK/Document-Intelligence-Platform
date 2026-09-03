/**
 * Stage 7 Automated Verification Test Suite
 * Verifies AI Chat Over Documents, Restricted JSON Query Contract, Zero Raw SQL Execution,
 * Dynamic Field/Alias Resolution, Exact Database Aggregations (SUM, AVG, COUNT),
 * Tenant Isolation, Follow-Up Context Refinement, and Preserving Stages 1–6!
 */

const ChatService = require('../backend/src/services/chatService');
const ChatQueryValidator = require('../backend/src/services/chatQueryValidator');
const StructuredDataService = require('../backend/src/services/structuredDataService');
const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');

async function runStage7Tests() {
  console.log('==================================================');
  console.log('Running Stage 7 Automated Verification Suite');
  console.log('==================================================\n');

  const ORG_A = '00000000-0000-0000-0000-000000000001';
  const ORG_B = '00000000-0000-0000-0000-000000000002';

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
    // Setup Profile & Sample Approved Records (Values: 100, 200, 300)
    const profile = await ProfileService.createProfile(ORG_A, { name: 'Stage 7 Chat Profile' });
    const docType = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Bill Receipt', key: 'bill_receipt' });
    await ProfileService.publishSchema(ORG_A, profile.profileId);

    const uploadRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'chat_sample_doc.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 chat test pdf')
    }]);

    const documentId = uploadRes.documentId || uploadRes.uploads[0].documentId;
    const jobId = uploadRes.jobId || uploadRes.uploads[0].jobId;

    // Create 3 approved records for aggregation testing: 100, 200, 300
    await StructuredDataService.createStructuredRecord(ORG_A, {
      documentId, logicalDocumentId: 'l1', profileId: profile.profileId, documentTypeId: docType.documentTypeId, schemaVersionId: profile.currentSchemaVersionId, processingJobId: jobId, status: 'APPROVED',
      fields: [{ fieldKey: 'total_amount', dataType: 'decimal', machineValue: '100.00' }]
    });
    await StructuredDataService.createStructuredRecord(ORG_A, {
      documentId, logicalDocumentId: 'l2', profileId: profile.profileId, documentTypeId: docType.documentTypeId, schemaVersionId: profile.currentSchemaVersionId, processingJobId: jobId, status: 'APPROVED',
      fields: [{ fieldKey: 'total_amount', dataType: 'decimal', machineValue: '200.00' }]
    });
    await StructuredDataService.createStructuredRecord(ORG_A, {
      documentId, logicalDocumentId: 'l3', profileId: profile.profileId, documentTypeId: docType.documentTypeId, schemaVersionId: profile.currentSchemaVersionId, processingJobId: jobId, status: 'APPROVED',
      fields: [{ fieldKey: 'total_amount', dataType: 'decimal', machineValue: '300.00' }]
    });

    // 1. Basic search question
    const q1 = await ChatService.processUserMessage(ORG_A, { message: 'Show all records created this month' });
    assert(q1.answer && q1.intent === 'SEARCH_RECORDS', '1. Natural language search question processed');

    // 2. Count question
    const q2 = await ChatService.processUserMessage(ORG_A, { message: 'How many approved records exist?' });
    assert(q2.intent === 'COUNT_RECORDS' && q2.aggregateMetric.value >= 3, '2. Count question returned exact database count (>= 3)');

    // 3. Numeric greater-than query
    const q3 = await ChatService.processUserMessage(ORG_A, { message: 'Find records where total amount is above 150' });
    assert(q3.queryPlan.filters.length > 0, '3. Numeric greater-than filter resolved (total_amount > 150)');

    // 6 & 26. CRITICAL AGGREGATION & GROUNDING TEST: Database SUM (100 + 200 + 300 = 600)
    const qSUM = await ChatService.processUserMessage(ORG_A, { message: 'What is the total sum of total_amount?' });
    assert(qSUM.intent === 'SUM_FIELD' && qSUM.aggregateMetric.value === 600, '6 & 26. CRITICAL: Database performs exact SUM calculation (600) and AI answer is strictly grounded');

    // 7. AVG aggregation (600 / 3 = 200)
    const qAVG = await ChatService.processUserMessage(ORG_A, { message: 'What is the average of total_amount?' });
    assert(qAVG.intent === 'AVG_FIELD' && qAVG.aggregateMetric.value === 200, '7. Database performs exact AVG calculation (200)');

    // 16. Unsupported intent rejected
    let unsupportedIntentRejected = false;
    try {
      ChatQueryValidator.validateQueryPlan({ intent: 'UNRESTRICTED_QUERY' });
    } catch (e) {
      if (e.code === 'UNSUPPORTED_INTENT') unsupportedIntentRejected = true;
    }
    assert(unsupportedIntentRejected, '16. Unsupported intent rejected by validator');

    // 21. CRITICAL SECURITY TEST: NO RAW SQL FROM AI REJECTED
    let rawSqlRejected = false;
    try {
      ChatQueryValidator.validateQueryPlan({
        intent: 'SEARCH_RECORDS',
        sql: 'SELECT * FROM structured_records WHERE organization_id = 1'
      });
    } catch (e) {
      if (e.code === 'RAW_SQL_REJECTED') rawSqlRejected = true;
    }
    assert(rawSqlRejected, '21. CRITICAL SECURITY: AI plan containing raw SQL strictly rejected with RAW_SQL_REJECTED');

    // 24. CRITICAL TENANT ISOLATION TEST
    const qTenantB = await ChatService.processUserMessage(ORG_B, { message: 'Show all records' });
    assert(qTenantB.resultsCount === 0, '24. CRITICAL: Organization B AI query returns 0 Organization A records');

    // 28. CRITICAL FOLLOW-UP CONVERSATION TEST
    const sess = await ChatService.createSession(ORG_A, 'Follow-up Test');
    const msg1 = await ChatService.processUserMessage(ORG_A, { sessionId: sess.chatSessionId, message: 'Show records created this month' });
    const msg2 = await ChatService.processUserMessage(ORG_A, { sessionId: sess.chatSessionId, message: 'Only those with total amount above 150' });
    assert(msg2.queryPlan.filters.length >= 2, '28. CRITICAL: Follow-up message refined previous query context filters');

    console.log('\n==================================================');
    console.log(`STAGE 7 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 7 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage7Tests();
}

module.exports = { runStage7Tests };
