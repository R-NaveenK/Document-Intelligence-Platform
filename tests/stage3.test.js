/**
 * Stage 3 Automated Verification Test Suite
 * Verifies Document Upload, File Validation, Size Enforcement, Magic Bytes,
 * SHA-256 Duplicate Detection, Storage Abstraction, Frozen Schema Versioning,
 * Async Extraction Handoff, Job Retry Mechanism, Idempotency Caching, and Path Sanitization.
 */

const IngestionService = require('../backend/src/services/ingestionService');
const ProfileService = require('../backend/src/services/profileService');
const storageService = require('../backend/src/services/storageService');
const { validateUploadedFile, sanitizeFilename } = require('../backend/src/utils/fileValidation');

async function runStage3Tests() {
  console.log('==================================================');
  console.log('Running Stage 3 Automated Verification Suite');
  console.log('==================================================\n');

  const ORG_A = '00000000-0000-0000-0000-000000000001';
  const ORG_B = '00000000-0000-0000-0000-000000000099';

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

  // Generate valid test file buffers
  const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const invalidTxtBuffer = Buffer.from('Plain text file content not allowed');

  try {
    // Setup Profile & Publish Schema for testing
    const profile = await ProfileService.createProfile(ORG_A, {
      name: 'Stage 3 Financial Ingestion Profile',
      description: 'Profile for Stage 3 ingestion tests'
    });
    const docType = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Commercial Invoice' });
    await ProfileService.addField(ORG_A, docType.documentTypeId, { displayName: 'Invoice Total', dataType: 'decimal' });
    const publishRes = await ProfileService.publishSchema(ORG_A, profile.profileId);

    // 1. Valid PDF upload validation
    const pdfVal = validateUploadedFile({ originalname: 'sample_invoice.pdf', mimetype: 'application/pdf', buffer: validPdfBuffer });
    assert(pdfVal && pdfVal.ext === '.pdf', '1. Valid PDF upload validation & magic byte check');

    // 2. Valid PNG/JPG upload validation
    const pngVal = validateUploadedFile({ originalname: 'receipt.png', mimetype: 'image/png', buffer: validPngBuffer });
    assert(pngVal && pngVal.ext === '.png', '2. Valid PNG upload validation & magic byte check');

    // 3. Reject unsupported file type
    let unsupportedCaught = false;
    try {
      validateUploadedFile({ originalname: 'script.exe', mimetype: 'application/octet-stream', buffer: invalidTxtBuffer });
    } catch (e) {
      if (e.code === 'UNSUPPORTED_FILE_TYPE') unsupportedCaught = true;
    }
    assert(unsupportedCaught, '3. Reject unsupported file type (.exe / invalid extension)');

    // 4. Reject oversized file
    let oversizeCaught = false;
    try {
      const hugeBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB
      hugeBuffer.write('%PDF-1.4');
      validateUploadedFile({ originalname: 'huge.pdf', mimetype: 'application/pdf', buffer: hugeBuffer });
    } catch (e) {
      if (e.code === 'FILE_TOO_LARGE') oversizeCaught = true;
    }
    assert(oversizeCaught, '4. Reject oversized file exceeding MAX_UPLOAD_SIZE_MB');

    // 5. Ingest valid file & create document record + job
    const uploadRes1 = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'invoice_batch_001.pdf',
      mimetype: 'application/pdf',
      buffer: validPdfBuffer
    }]);

    assert(uploadRes1.success && uploadRes1.documentId && uploadRes1.jobId, '5. Document record created & job initialized');
    assert(uploadRes1.status === 'QUEUED', '5. Initial job status set to QUEUED');
    assert(uploadRes1.schemaVersion === publishRes.schemaVersion, '5. Frozen schema version attached to job');

    // 6. Detect exact duplicate within same organization (SHA-256)
    const dupRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'invoice_batch_001_copy.pdf',
      mimetype: 'application/pdf',
      buffer: validPdfBuffer
    }]);

    assert(dupRes.success === false && dupRes.error.code === 'DUPLICATE_DOCUMENT', '6. SHA-256 exact duplicate detected within same organization');

    // 7. Allow same checksum in a different organization
    const profileB = await ProfileService.createProfile(ORG_B, { name: 'Org B Profile' });
    await ProfileService.publishSchema(ORG_B, profileB.profileId);
    const orgBRes = await IngestionService.ingestFiles(ORG_B, profileB.profileId, [{
      originalname: 'invoice_batch_001.pdf',
      mimetype: 'application/pdf',
      buffer: validPdfBuffer
    }]);
    assert(orgBRes.success && orgBRes.documentId, '7. Allow same checksum buffer in a different organization');

    // 8. Profile without published schema rejection
    const unpublishedProfile = await ProfileService.createProfile(ORG_A, { name: 'Draft Profile Only' });
    let unpublishedCaught = false;
    try {
      await IngestionService.ingestFiles(ORG_A, unpublishedProfile.profileId, [{
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: validPdfBuffer
      }]);
    } catch (e) {
      if (e.code === 'UNPUBLISHED_SCHEMA') unpublishedCaught = true;
    }
    assert(unpublishedCaught, '8. Profile without published schema rejected');

    // 9. Path sanitization check
    const unsafeName = sanitizeFilename('../../../dangerous_path/payload.pdf');
    assert(unsafeName === 'payload.pdf', '9. Path traversal attempt sanitized (../../../payload.pdf -> payload.pdf)');

    // 10. Original file safely stored via storage abstraction
    const storedFile = await storageService.getFile(ORG_A, uploadRes1.documentId);
    assert(storedFile && storedFile.buffer.length === validPdfBuffer.length, '10. Original file retrieved cleanly from storage abstraction');

    // 11. Idempotency Key Caching Check
    const keyHeader = 'idemp_key_12345';
    const idempRes1 = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'idemp_doc.png',
      mimetype: 'image/png',
      buffer: validPngBuffer
    }], keyHeader);

    const idempRes2 = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'idemp_doc.png',
      mimetype: 'image/png',
      buffer: validPngBuffer
    }], keyHeader);

    assert(idempRes1.documentId === idempRes2.documentId, '11. Idempotency key header prevents duplicate document creation');

    // 12. Document detail API retrieval (without exposing physical server paths)
    const docDetail = await IngestionService.getDocumentById(ORG_A, uploadRes1.documentId);
    assert(docDetail.documentId === uploadRes1.documentId && !docDetail.storagePath, '12. Document detail retrieved safely without physical server path leak');

    // 13. Job Retry API execution
    const retryRes = await IngestionService.retryJob(ORG_A, uploadRes1.jobId);
    assert(retryRes.jobId === uploadRes1.jobId && retryRes.retryCount === 1, '13. Job retry executed successfully (retryCount incremented)');

    // 14. Cross-organization document access blocked
    let crossDocBlocked = false;
    try {
      await IngestionService.getDocumentById(ORG_B, uploadRes1.documentId);
    } catch (e) {
      if (e.code === 'NOT_FOUND') crossDocBlocked = true;
    }
    assert(crossDocBlocked, '14. Cross-organization tenant document access blocked');

    // 15. Multiple file upload handling
    const multiRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [
      { originalname: 'multi1.png', mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x01]) },
      { originalname: 'multi2.png', mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x02]) }
    ]);
    assert(multiRes.uploads && multiRes.uploads.length === 2, '15. Multiple document upload returns individual file results');

    // 16. IMPORTANT E2E TEST: Dynamic profile creation -> Publish -> File Upload -> Checksum -> Storage -> Job Queued -> Handoff
    console.log('\n--- IMPORTANT E2E TEST: Full Ingestion & Extraction Handoff Pipeline ---');
    const e2eProfile = await ProfileService.createProfile(ORG_A, { name: 'E2E Shipping Profile' });
    await ProfileService.addDocumentType(ORG_A, e2eProfile.profileId, { name: 'Bill of Lading' });
    await ProfileService.publishSchema(ORG_A, e2eProfile.profileId);

    const e2eUpload = await IngestionService.ingestFiles(ORG_A, e2eProfile.profileId, [{
      originalname: 'waybill_2026.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\ne2e test pdf content\n%%EOF')
    }]);

    assert(e2eUpload.success && e2eUpload.documentId, '16. E2E Upload accepted & documentId generated');
    assert(e2eUpload.status === 'QUEUED', '16. Document status initialized as QUEUED');
    assert(e2eUpload.schemaVersion === 1, '16. Schema version frozen as version 1');

    const e2eStored = await storageService.getFile(ORG_A, e2eUpload.documentId);
    assert(e2eStored && e2eStored.buffer.toString().includes('e2e test pdf content'), '16. Original PDF file safely stored & verifiable from storage abstraction');

    console.log('\n==================================================');
    console.log(`STAGE 3 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 3 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage3Tests();
}

module.exports = { runStage3Tests };
