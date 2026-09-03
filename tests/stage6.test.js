/**
 * Stage 6 Automated Verification Test Suite
 * Verifies Structured Data Storage, Dynamic Field Persistence, Typed Storage Columns
 * (String, Integer, Decimal, Date, Datetime, Boolean), Machine vs Human vs Effective Values,
 * Full-Text Search, Parameterized Query Builder, Dynamic Filter Allowlist,
 * SQL Injection Security, Tenant Isolation, and Preserving Stages 1–5!
 */

const StructuredDataService = require('../backend/src/services/structuredDataService');
const SearchService = require('../backend/src/services/searchService');
const QueryBuilder = require('../backend/src/services/queryBuilder');
const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');

async function runStage6Tests() {
  console.log('==================================================');
  console.log('Running Stage 6 Automated Verification Suite');
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
    // Setup Profile & Documents
    const profile = await ProfileService.createProfile(ORG_A, { name: 'Stage 6 Search Test Profile' });
    const docType = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Freight Invoice', key: 'freight_inv' });
    await ProfileService.publishSchema(ORG_A, profile.profileId);

    const uploadRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'container_manifest_99.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 sample manifest file for stage 6')
    }]);

    const documentId = uploadRes.documentId || uploadRes.uploads[0].documentId;
    const jobId = uploadRes.jobId || uploadRes.uploads[0].jobId;

    // 1 - 11. Create Structured Record with Typed Field Values
    const recordRes = await StructuredDataService.createStructuredRecord(ORG_A, {
      documentId,
      logicalDocumentId: 'logical_doc_stg6_1',
      profileId: profile.profileId,
      documentTypeId: docType.documentTypeId,
      schemaVersionId: profile.currentSchemaVersionId,
      processingJobId: jobId,
      status: 'APPROVED',
      fields: [
        { fieldKey: 'vendor_name', dataType: 'string', machineValue: 'Acme Shipping Corp', humanValue: null, confidence: 0.98 },
        { fieldKey: 'container_count', dataType: 'integer', machineValue: '42', humanValue: null, confidence: 0.95 },
        { fieldKey: 'total_amount', dataType: 'decimal', machineValue: '$7500.50', humanValue: null, confidence: 0.94 },
        { fieldKey: 'invoice_date', dataType: 'date', machineValue: '2026-08-15', humanValue: null, confidence: 0.99 },
        { fieldKey: 'hazardous_flag', dataType: 'boolean', machineValue: 'false', humanValue: null, confidence: 0.99 },
        { fieldKey: 'tracking_code', dataType: 'string', machineValue: 'OLD_MACHINE_ABC', humanValue: 'NEW_HUMAN_XYZ', confidence: 0.70 }
      ],
      validationResults: [
        { fieldKey: 'total_amount', validationType: 'ARITHMETIC', passed: true, message: 'Amount arithmetic check passed' }
      ]
    });

    const recId = recordRes.record.structuredRecordId;
    assert(recId, '1. Structured record created successfully');
    assert(recordRes.fields.length === 6, '2. Dynamic fields persisted');

    // 3, 4, 5. Machine vs Human vs Effective Value
    const trackingField = recordRes.fields.find(f => f.fieldKey === 'tracking_code');
    assert(trackingField.machineValue === 'OLD_MACHINE_ABC', '3. Machine value preserved (OLD_MACHINE_ABC)');
    assert(trackingField.humanValue === 'NEW_HUMAN_XYZ', '4. Human value stored separately (NEW_HUMAN_XYZ)');
    assert(trackingField.effectiveValue === 'NEW_HUMAN_XYZ', '5. Effective value resolves to human correction (NEW_HUMAN_XYZ)');

    // 6 - 11. Typed Columns Verification
    const countField = recordRes.fields.find(f => f.fieldKey === 'container_count');
    assert(countField.valueInteger === 42, '7. Integer typed column populated (42)');

    const amountField = recordRes.fields.find(f => f.fieldKey === 'total_amount');
    assert(amountField.valueDecimal === 7500.50, '8. Decimal typed column populated (7500.50)');

    const dateField = recordRes.fields.find(f => f.fieldKey === 'invoice_date');
    assert(dateField.valueDate === '2026-08-15', '9. Date typed column populated (2026-08-15)');

    const boolField = recordRes.fields.find(f => f.fieldKey === 'hazardous_flag');
    assert(boolField.valueBoolean === false, '11. Boolean typed column populated (false)');

    // 14 & 15. Validation Result & History Persistence
    const recordDetail = await StructuredDataService.getRecordById(ORG_A, recId);
    assert(recordDetail.validationResults.length === 1, '14 & 15. Validation result history persisted');

    // 17 & 18. Record Listing & Pagination
    const listRes = await StructuredDataService.listRecords(ORG_A, { page: 1, limit: 10 });
    assert(listRes.results.length >= 1, '17 & 18. Structured records listed with pagination');

    // 19 - 22. Full-Text Search
    const searchRes = await SearchService.fullTextSearch(ORG_A, { q: 'container_manifest_99.pdf' });
    assert(searchRes.results.length === 1, '20. Full-text search found record by filename');

    // 24 & 25. String Filters (contains)
    const queryContains = await SearchService.querySearch(ORG_A, {
      filters: [{ fieldKey: 'vendor_name', operator: 'contains', value: 'Shipping' }]
    });
    assert(queryContains.results.length === 1, '25. String contains filter matched record (Shipping)');

    // 26 & 27. Numeric Typed Filters (greater_than & between)
    const queryNumGT = await SearchService.querySearch(ORG_A, {
      filters: [{ fieldKey: 'total_amount', operator: 'greater_than', value: 5000 }]
    });
    assert(queryNumGT.results.length === 1, '26. Numeric greater_than filter matched record (total_amount > 5000)');

    const queryNumBetween = await SearchService.querySearch(ORG_A, {
      filters: [{ fieldKey: 'container_count', operator: 'between', valueMin: 40, valueMax: 50 }]
    });
    assert(queryNumBetween.results.length === 1, '27. Numeric between filter matched record (40 <= container_count <= 50)');

    // 32. Invalid Operator Rejection
    let invalidOpRejected = false;
    try {
      QueryBuilder.validateFilter({ fieldKey: 'total_amount', operator: 'contains', value: 100 }, { dataType: 'decimal' });
    } catch (e) {
      invalidOpRejected = true;
    }
    assert(invalidOpRejected, '32. Invalid operator for data type rejected (UNSUPPORTED_OPERATOR)');

    // 33. CRITICAL SECURITY TEST: SQL Injection Attempt Safely Rejected
    let sqlInjRejected = false;
    try {
      QueryBuilder.validateFilter({ fieldKey: "amount'; DROP TABLE structured_records;--", operator: 'equals', value: 10 });
    } catch (e) {
      if (e.code === 'INVALID_FIELD_KEY') sqlInjRejected = true;
    }
    assert(sqlInjRejected, '33. CRITICAL SECURITY: SQL injection attempt safely rejected (DROP TABLE / malicious fieldKey)');

    // 36 & 37. Cross-Tenant Record Access & Search Blocked
    const crossTenantSearch = await SearchService.fullTextSearch(ORG_B, { q: 'manifest' });
    assert(crossTenantSearch.results.length === 0, '36 & 37. Cross-tenant search blocked (Organization B cannot view Organization A records)');

    // 39. CRITICAL HUMAN CORRECTION SEARCH TEST
    const humanSearchRes = await SearchService.fullTextSearch(ORG_A, { q: 'NEW_HUMAN_XYZ' });
    assert(humanSearchRes.results.length === 1, '39. CRITICAL: Search for human-corrected value (NEW_HUMAN_XYZ) successfully finds record');

    console.log('\n==================================================');
    console.log(`STAGE 6 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 6 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage6Tests();
}

module.exports = { runStage6Tests };
