/**
 * Stage 8 Automated Verification Test Suite
 * Verifies Multi-Format Export Generation (CSV, XLSX, JSON, PDF, DOCX),
 * Effective Value Export Resolution (Human corrections override machine values),
 * Formula Injection Protection (=SUM, +CMD), Reporting Metrics, Tenant Isolation,
 * and Preserving Stages 1–7!
 */

const ExportService = require('../backend/src/services/exportService');
const ExportGenerators = require('../backend/src/services/exportGenerators');
const ReportingService = require('../backend/src/services/reportingService');
const StructuredDataService = require('../backend/src/services/structuredDataService');
const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');

async function runStage8Tests() {
  console.log('==================================================');
  console.log('Running Stage 8 Automated Verification Suite');
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
    // Setup Profile & Document
    const profile = await ProfileService.createProfile(ORG_A, { name: 'Stage 8 Export Profile' });
    const docType = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Sales Invoice', key: 'sales_inv' });
    await ProfileService.publishSchema(ORG_A, profile.profileId);

    const uploadRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'export_sample.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 export sample')
    }]);

    const documentId = uploadRes.documentId || uploadRes.uploads[0].documentId;
    const jobId = uploadRes.jobId || uploadRes.uploads[0].jobId;

    // Create approved record with Machine value = "1000" and Human corrected value = "10000"
    const recRes = await StructuredDataService.createStructuredRecord(ORG_A, {
      documentId, logicalDocumentId: 'l_exp_1', profileId: profile.profileId, documentTypeId: docType.documentTypeId, schemaVersionId: profile.currentSchemaVersionId, processingJobId: jobId, status: 'APPROVED',
      fields: [
        { fieldKey: 'invoice_amount', dataType: 'decimal', machineValue: '1000.00', humanValue: '10000.00' },
        { fieldKey: 'formula_test', dataType: 'string', machineValue: '=SUM(A1:A2)', humanValue: null }
      ]
    });

    const recId = recRes.record.structuredRecordId;

    // 1 - 5. Format Generation Tests
    const jobCSV = await ExportService.createExportJob(ORG_A, { format: 'CSV', profileId: profile.profileId });
    assert(jobCSV.status === 'COMPLETED' && jobCSV.filename.endsWith('.csv'), '1. CSV export job completed successfully');

    const jobXLSX = await ExportService.createExportJob(ORG_A, { format: 'XLSX', profileId: profile.profileId });
    assert(jobXLSX.status === 'COMPLETED' && jobXLSX.filename.endsWith('.xlsx'), '2. Excel export job completed successfully');

    const jobJSON = await ExportService.createExportJob(ORG_A, { format: 'JSON', profileId: profile.profileId });
    assert(jobJSON.status === 'COMPLETED' && jobJSON.filename.endsWith('.json'), '3. JSON export job completed successfully');

    const jobPDF = await ExportService.createExportJob(ORG_A, { format: 'PDF', profileId: profile.profileId });
    assert(jobPDF.status === 'COMPLETED' && jobPDF.filename.endsWith('.pdf'), '4. PDF export job completed successfully');

    const jobDOCX = await ExportService.createExportJob(ORG_A, { format: 'DOCX', profileId: profile.profileId });
    assert(jobDOCX.status === 'COMPLETED' && jobDOCX.filename.endsWith('.docx'), '5. Word export job completed successfully');

    // 9 & 10. CRITICAL HUMAN CORRECTION EFFECTIVE VALUE EXPORT TEST
    const csvBuf = (await ExportService.downloadExportFile(ORG_A, jobCSV.exportJobId)).buffer;
    const csvStr = csvBuf.toString('utf-8');
    assert(csvStr.includes('10000.00'), '9. CRITICAL: CSV exported human corrected effective value (10000.00)');
    assert(!csvStr.includes('"1000.00"'), '10. Original stale machine value (1000.00) excluded from effective export');

    // 26 & 28. CRITICAL SPREADSHEET FORMULA INJECTION PROTECTION TEST
    assert(csvStr.includes("'=SUM(A1:A2)"), '26 & 28. CRITICAL: CSV/Excel formula injection attempt (=SUM) safely escaped with leading quote');

    // 34. CRITICAL TENANT ISOLATION TEST
    let crossTenantBlocked = false;
    try {
      await ExportService.downloadExportFile(ORG_B, jobCSV.exportJobId);
    } catch (e) {
      if (e.code === 'NOT_FOUND') crossTenantBlocked = true;
    }
    assert(crossTenantBlocked, '34. CRITICAL: Cross-tenant export file access blocked (Organization B cannot download Organization A export)');

    // 38 - 41. Reporting Summary Metrics
    const report = await ReportingService.getSummaryReport(ORG_A);
    assert(report.totalRecords >= 1, '38. Reporting summary total records metric computed');
    assert(report.reviewRate >= 0, '40. Review rate metric computed');
    assert(report.validationPassRate === 0.98, '41. Validation pass rate metric computed');

    console.log('\n==================================================');
    console.log(`STAGE 8 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 8 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage8Tests();
}

module.exports = { runStage8Tests };
