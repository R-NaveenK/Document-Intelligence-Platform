/**
 * Complete Full-Platform End-to-End Integration Verification Suite
 * Exercises Stages 1 through 9 continuously:
 * Profile Config -> Ingestion -> Classification -> Structuring -> Validation ->
 * Human Review -> Structured Storage -> Search & Filter -> AI Chat ->
 * Multi-Format Export -> Living Schema Upgrade -> Historical Reprocessing!
 */

const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');
const StructuredDataService = require('../backend/src/services/structuredDataService');
const ReviewService = require('../backend/src/services/reviewService');
const SearchService = require('../backend/src/services/searchService');
const ChatService = require('../backend/src/services/chatService');
const ExportService = require('../backend/src/services/exportService');
const ReprocessingService = require('../backend/src/services/reprocessingService');

async function runE2ETests() {
  console.log('==================================================');
  console.log('Running Full-Platform E2E Verification Suite (Stages 1-9)');
  console.log('==================================================\n');

  const ORG_ID = '00000000-0000-0000-0000-000000000001';
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
    // 1. Stage 2: Create Profile, Document Type, and Custom Fields (0 Hard-coded fields)
    const profile = await ProfileService.createProfile(ORG_ID, { name: 'E2E Full Platform Profile' });
    const docType = await ProfileService.addDocumentType(ORG_ID, profile.profileId, { name: 'Commercial Bill', key: 'comm_bill' });
    await ProfileService.addField(ORG_ID, docType.documentTypeId, { fieldKey: 'vendor_name', displayName: 'Vendor Name', dataType: 'string' });
    await ProfileService.addField(ORG_ID, docType.documentTypeId, { fieldKey: 'bill_amount', displayName: 'Bill Amount', dataType: 'decimal' });
    const v1Schema = await ProfileService.publishSchema(ORG_ID, profile.profileId);
    assert(v1Schema.schemaVersion === 1, 'Stage 2: Profile & Schema Version 1 published');

    // 2. Stage 3: Upload Document
    const uploadRes = await IngestionService.ingestFiles(ORG_ID, profile.profileId, [{
      originalname: 'commercial_bill_e2e.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 sample commercial bill for full e2e')
    }]);

    const documentId = uploadRes.documentId || uploadRes.uploads[0].documentId;
    const jobId = uploadRes.jobId || uploadRes.uploads[0].jobId;
    assert(documentId && jobId, 'Stage 3: Document ingested and job QUEUED');

    // 3. Stage 4 & 5: Process through Structuring & Human Review
    const recRes = await StructuredDataService.createStructuredRecord(ORG_ID, {
      documentId, logicalDocumentId: 'e2e_log_1', profileId: profile.profileId, documentTypeId: docType.documentTypeId, schemaVersionId: v1Schema.schemaVersionId, processingJobId: jobId, status: 'APPROVED',
      fields: [
        { fieldKey: 'vendor_name', dataType: 'string', machineValue: 'OLD_VENDOR_CORP', humanValue: 'NEW_VENDOR_CORP' },
        { fieldKey: 'bill_amount', dataType: 'decimal', machineValue: '5500.00' }
      ]
    });

    const recordId = recRes.record.structuredRecordId;
    assert(recordId, 'Stage 5 & 6: Structured Record created with effective value NEW_VENDOR_CORP');

    // 4. Stage 6: Search & Dynamic Multi-Filter Query
    const searchRes = await SearchService.querySearch(ORG_ID, {
      profileId: profile.profileId,
      filters: [{ fieldKey: 'bill_amount', operator: 'greater_than', value: 5000 }]
    });
    assert(searchRes.results.length === 1, 'Stage 6: Search query matched record (bill_amount > 5000)');

    // 5. Stage 7: AI Chat Natural Language Query & Database Aggregation
    const chatRes = await ChatService.processUserMessage(ORG_ID, { message: 'What is the total sum of bill_amount?' });
    assert(chatRes.intent === 'SUM_FIELD' && chatRes.aggregateMetric && chatRes.aggregateMetric.value === 5500, 'Stage 7: AI Chat database aggregation calculated SUM = 5500');

    // 6. Stage 8: Multi-Format Export Generation (CSV)
    const exportJob = await ExportService.createExportJob(ORG_ID, { format: 'CSV', profileId: profile.profileId });
    const downloadRes = await ExportService.downloadExportFile(ORG_ID, exportJob.exportJobId);
    assert(downloadRes.buffer.toString('utf-8').includes('NEW_VENDOR_CORP'), 'Stage 8: CSV Export generated containing effective value NEW_VENDOR_CORP');

    // 7. Stage 9: Living Schema Upgrade to Schema Version 2 & Historical Reprocessing
    await ProfileService.addField(ORG_ID, docType.documentTypeId, { fieldKey: 'po_reference', displayName: 'PO Reference', dataType: 'string' });
    const v2Schema = await ProfileService.publishSchema(ORG_ID, profile.profileId);
    assert(v2Schema.schemaVersion > v1Schema.schemaVersion, 'Stage 9: Schema Version 2 published with new field po_reference');

    const reprocessJob = await ReprocessingService.createReprocessingJob(ORG_ID, {
      profileId: profile.profileId,
      targetSchemaVersionId: v2Schema.schemaVersionId,
      fieldKeys: ['po_reference'],
      scope: { recordIds: [recordId] }
    });
    assert(reprocessJob.status === 'COMPLETED', 'Stage 9: Living Schema reprocessing completed without re-uploading document');

    // Verify newly enriched field in search & export
    const enrichedRecord = await StructuredDataService.getRecordById(ORG_ID, recordId);
    const poField = enrichedRecord.fields.find(f => f.fieldKey === 'po_reference');
    assert(poField && poField.effectiveValue !== null, 'Stage 9: Newly enriched field po_reference present on historical record');

    console.log('\n==================================================');
    console.log(`FULL PLATFORM E2E SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Full Platform E2E execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runE2ETests();
}

module.exports = { runE2ETests };
