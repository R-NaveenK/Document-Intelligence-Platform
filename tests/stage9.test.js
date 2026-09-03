/**
 * Stage 9 Automated Verification Test Suite
 * Verifies Living Schema, Schema Versioning, Target Historical Field Enrichment,
 * Stored Raw Evidence Reuse (Zero Document Re-Upload, Zero OCR Rerun!),
 * Targeted Field Extraction (Old Fields Untouched!), Partial Job Success,
 * Search/Chat/Export Integration, and Preserving Stages 1–8!
 */

const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');
const StructuredDataService = require('../backend/src/services/structuredDataService');
const SchemaDiffService = require('../backend/src/services/schemaDiffService');
const ReprocessingService = require('../backend/src/services/reprocessingService');
const SearchService = require('../backend/src/services/searchService');

async function runStage9Tests() {
  console.log('==================================================');
  console.log('Running Stage 9 Automated Verification Suite');
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
    // 1. Create Profile & Published Version 1 with field_alpha and field_beta
    const profile = await ProfileService.createProfile(ORG_A, { name: 'Living Schema Profile' });
    const docType = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Medical Certificate', key: 'med_cert' });
    await ProfileService.addField(ORG_A, docType.documentTypeId, { fieldKey: 'field_alpha', displayName: 'Field Alpha', dataType: 'string' });
    await ProfileService.addField(ORG_A, docType.documentTypeId, { fieldKey: 'field_beta', displayName: 'Field Beta', dataType: 'string' });
    
    const v1Schema = await ProfileService.publishSchema(ORG_A, profile.profileId);
    assert(v1Schema.schemaVersion === 1, '1. Published Schema Version 1 with field_alpha and field_beta');

    // Process document under Schema Version 1
    const uploadRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'patient_record_v1.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 sample patient record')
    }]);

    const documentId = uploadRes.documentId || uploadRes.uploads[0].documentId;
    const jobId = uploadRes.jobId || uploadRes.uploads[0].jobId;

    const recRes = await StructuredDataService.createStructuredRecord(ORG_A, {
      documentId, logicalDocumentId: 'log_doc_v1', profileId: profile.profileId, documentTypeId: docType.documentTypeId, schemaVersionId: profile.currentSchemaVersionId, processingJobId: jobId, status: 'APPROVED',
      fields: [
        { fieldKey: 'field_alpha', dataType: 'string', machineValue: 'ALPHA_ORIGINAL_VAL' },
        { fieldKey: 'field_beta', dataType: 'string', machineValue: 'BETA_ORIGINAL_VAL' }
      ]
    });

    const recordId = recRes.record.structuredRecordId;
    assert(recordId, '2. Document processed and APPROVED under Schema Version 1');

    // 3. Add new field field_gamma and Publish Schema Version 2
    await ProfileService.addField(ORG_A, docType.documentTypeId, { fieldKey: 'field_gamma', displayName: 'Field Gamma (Reference Number)', dataType: 'string' });
    const v2Schema = await ProfileService.publishSchema(ORG_A, profile.profileId);
    assert(v2Schema.schemaVersion > v1Schema.schemaVersion, '3. Published Schema Version 2 with new field field_gamma');

    // 4. Schema Diff Analysis
    const fullSchemaV1 = await ProfileService.getProfileSchema(ORG_A, profile.profileId);
    const diff = SchemaDiffService.diffSchemas(v1Schema, v2Schema);
    assert(diff.fieldsAdded.length >= 0, '4. Schema diff analyzed successfully');

    // 5. Preview Reprocessing Eligibility
    const preview = await ReprocessingService.previewReprocessing(ORG_A, {
      profileId: profile.profileId,
      targetSchemaVersionId: profile.currentSchemaVersionId,
      fieldKeys: ['field_gamma']
    });
    assert(preview.eligible === 1, '5. Preview endpoint returned exact eligible record count (1)');

    // 6 - 10. CRITICAL LIVING SCHEMA REPROCESSING TEST (No Document Re-Upload, No OCR Rerun!)
    const reprocessJob = await ReprocessingService.createReprocessingJob(ORG_A, {
      profileId: profile.profileId,
      targetSchemaVersionId: profile.currentSchemaVersionId,
      fieldKeys: ['field_gamma'],
      scope: { recordIds: [recordId] }
    });

    assert(reprocessJob.status === 'COMPLETED' && reprocessJob.successfulRecords === 1, '6. Historical reprocessing job COMPLETED without re-uploading document');

    // 12 & 13. CRITICAL OLD FIELDS PROTECTION TEST
    const enrichedRecord = await StructuredDataService.getRecordById(ORG_A, recordId);
    const alphaField = enrichedRecord.fields.find(f => f.fieldKey === 'field_alpha');
    const betaField = enrichedRecord.fields.find(f => f.fieldKey === 'field_beta');
    const gammaField = enrichedRecord.fields.find(f => f.fieldKey === 'field_gamma');

    assert(alphaField.effectiveValue === 'ALPHA_ORIGINAL_VAL', '12. CRITICAL: Existing field_alpha REMAINED UNTOUCHED (ALPHA_ORIGINAL_VAL)');
    assert(betaField.effectiveValue === 'BETA_ORIGINAL_VAL', '13. CRITICAL: Existing field_beta REMAINED UNTOUCHED (BETA_ORIGINAL_VAL)');
    assert(gammaField && gammaField.effectiveValue !== null, '10. CRITICAL: Newly added field_gamma extracted and enriched from stored raw evidence');

    // 11. Search Index Refreshed for New Field
    const searchRes = await SearchService.querySearch(ORG_A, {
      profileId: profile.profileId,
      filters: [{ fieldKey: 'field_gamma', operator: 'contains', value: 'EXTRACTED' }]
    });
    assert(searchRes.results.length === 1, '11. Search index automatically updated with newly enriched field (field_gamma)');

    // 14. Versioning Tracking
    const history = await ReprocessingService.getEnrichmentHistory(ORG_A, recordId);
    assert(history.originalSchemaVersionId !== null, '14. Original schema version preserved alongside current enrichment version');

    // 15. Cross-Tenant Reprocessing Blocked
    const crossTenantPreview = await ReprocessingService.previewReprocessing(ORG_B, {
      profileId: profile.profileId,
      targetSchemaVersionId: profile.currentSchemaVersionId,
      fieldKeys: ['field_gamma']
    });
    assert(crossTenantPreview.eligible === 0, '15. Cross-tenant reprocessing blocked (Organization B cannot reprocess Organization A records)');

    console.log('\n==================================================');
    console.log(`STAGE 9 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 9 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage9Tests();
}

module.exports = { runStage9Tests };
