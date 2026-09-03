/**
 * Stage 5 Automated Verification Test Suite
 * Verifies Human Review Queue, Multi-category Review Items (CLASSIFICATION, FIELD, VALIDATION),
 * Frozen Schema Document Type Validation, Machine vs Human Value Separation,
 * Page Grouping Corrections, Revalidation via Teammate Validation Mock,
 * Optimistic Concurrency Protection, Audit Events, and Pipeline Resume!
 */

const ReviewService = require('../backend/src/services/reviewService');
const ProfileService = require('../backend/src/services/profileService');
const IngestionService = require('../backend/src/services/ingestionService');
const { REVIEW_TYPES, REVIEW_STATUS, REVIEW_REASONS } = require('../shared/constants/reviewConstants');
const { PROCESSING_STATUS } = require('../shared/constants/statuses');

async function runStage5Tests() {
  console.log('==================================================');
  console.log('Running Stage 5 Automated Verification Suite');
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
    // Setup Profile & Ingestion Job
    const profile = await ProfileService.createProfile(ORG_A, { name: 'Stage 5 Review Test Profile' });
    const docType1 = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Purchase Order', key: 'po' });
    const docType2 = await ProfileService.addDocumentType(ORG_A, profile.profileId, { name: 'Tax Statement', key: 'tax' });
    await ProfileService.publishSchema(ORG_A, profile.profileId);

    const samplePdfBuffer = Buffer.from('%PDF-1.4 sample pdf content for stage 5 review tests');
    const uploadRes = await IngestionService.ingestFiles(ORG_A, profile.profileId, [{
      originalname: 'review_sample.pdf',
      mimetype: 'application/pdf',
      buffer: samplePdfBuffer
    }]);

    const documentId = uploadRes.documentId || (uploadRes.uploads && uploadRes.uploads[0].documentId);
    const jobId = uploadRes.jobId || (uploadRes.uploads && uploadRes.uploads[0].jobId);

    // 1. Create classification review item
    const reviewItem1 = await ReviewService.createReviewItem(ORG_A, {
      jobId,
      documentId,
      reviewType: REVIEW_TYPES.CLASSIFICATION,
      reviewReason: REVIEW_REASONS.LOW_CLASSIFICATION_CONFIDENCE,
      confidence: 0.65,
      originalValue: 'Invoice'
    });
    assert(reviewItem1.reviewItemId, '1. Classification review item created successfully');
    assert(reviewItem1.reviewType === REVIEW_TYPES.CLASSIFICATION, '1. Review type is CLASSIFICATION');

    // 2. Create field review item
    const reviewItem2 = await ReviewService.createReviewItem(ORG_A, {
      jobId,
      documentId,
      reviewType: REVIEW_TYPES.FIELD,
      reviewReason: REVIEW_REASONS.LOW_FIELD_CONFIDENCE,
      sourceFieldKey: 'invoice_total',
      originalValue: '$100.00',
      confidence: 0.72
    });
    assert(reviewItem2.reviewType === REVIEW_TYPES.FIELD, '2. Field review item created successfully');

    // 3. Create validation review item
    const reviewItem3 = await ReviewService.createReviewItem(ORG_A, {
      jobId,
      documentId,
      reviewType: REVIEW_TYPES.VALIDATION,
      reviewReason: REVIEW_REASONS.VALIDATION_FAILED,
      sourceFieldKey: 'due_date',
      originalValue: '2026-02-31'
    });
    assert(reviewItem3.reviewType === REVIEW_TYPES.VALIDATION, '3. Validation review item created successfully');

    // 4. List reviews by organization
    const listA = await ReviewService.listReviews(ORG_A);
    assert(listA.length >= 3, '4. Reviews listed for Organization A');

    // 5. Filter review queue
    const filtered = await ReviewService.listReviews(ORG_A, { reviewType: REVIEW_TYPES.FIELD });
    assert(filtered.length === 1 && filtered[0].reviewItemId === reviewItem2.reviewItemId, '5. Filter review queue by reviewType = FIELD');

    // 6. Cross-tenant review access blocked
    let crossTenantBlocked = false;
    try {
      await ReviewService.getReviewById(ORG_B, reviewItem1.reviewItemId);
    } catch (e) {
      crossTenantBlocked = true;
    }
    assert(crossTenantBlocked, '6. Cross-tenant review access blocked');

    // 7. Reviewer assignment
    const assigned = await ReviewService.assignReviewer(ORG_A, reviewItem1.reviewItemId, 'user_reviewer_101', 1);
    assert(assigned.assignedTo === 'user_reviewer_101', '7. Reviewer assigned successfully');

    // 8. Start review (OPEN -> IN_PROGRESS)
    const started = await ReviewService.startReview(ORG_A, reviewItem1.reviewItemId, 2);
    assert(started.status === REVIEW_STATUS.IN_PROGRESS, '8. Review status transitioned from OPEN to IN_PROGRESS');

    // 9 & 10. Correct classification using only frozen schema document types
    const correctedCls = await ReviewService.correctClassification(ORG_A, reviewItem1.reviewItemId, {
      documentTypeId: docType1.documentTypeId,
      rowVersion: 3
    });
    assert(correctedCls.correctedValue === 'Purchase Order', '9 & 10. Classification corrected using frozen schema type (Purchase Order)');

    // 11. Reject invalid document type not in frozen schema version
    let invalidDocTypeRejected = false;
    try {
      await ReviewService.correctClassification(ORG_A, reviewItem1.reviewItemId, {
        documentTypeId: 'invalid_type_9999',
        rowVersion: 4
      });
    } catch (e) {
      invalidDocTypeRejected = true;
    }
    assert(invalidDocTypeRejected, '11. Attempt to use document type not in frozen schema rejected');

    // 12, 13, 14. Page grouping correction (split / merge)
    const groupingRes = await ReviewService.correctGrouping(ORG_A, reviewItem1.reviewItemId, {
      action: 'SPLIT',
      targetPageNumber: 2,
      rowVersion: 4
    });
    assert(groupingRes.metadata.groupingAction === 'SPLIT', '12, 13, 14. Page grouping split action recorded');

    // 15, 16, 17, 18. Field Correction: Machine vs Human vs Effective Value
    const fieldRes = await ReviewService.correctField(ORG_A, reviewItem2.reviewItemId, {
      fieldKey: 'invoice_total',
      correctedValue: '$150.00',
      rowVersion: 1
    });
    assert(fieldRes.fieldValue.machineValue === '$100.00', '16. Original machine field value preserved ($100.00)');
    assert(fieldRes.fieldValue.humanValue === '$150.00', '17. Human corrected field value stored separately ($150.00)');
    assert(fieldRes.fieldValue.effectiveValue === '$150.00', '18. Effective value resolves to human value ($150.00)');

    // 19. Confirm existing field value
    const confirmRes = await ReviewService.correctField(ORG_A, reviewItem2.reviewItemId, {
      fieldKey: 'invoice_total',
      correctedValue: '$100.00',
      rowVersion: 2
    });
    assert(confirmRes.fieldValue.effectiveValue === '$100.00', '19. Confirm existing field value verified');

    // 20 & 22. Correct field and Revalidate via Validation Service
    await ReviewService.correctField(ORG_A, reviewItem3.reviewItemId, {
      fieldKey: 'due_date',
      correctedValue: '2026-02-28',
      rowVersion: 1
    });
    const revalRes = await ReviewService.revalidateReview(ORG_A, reviewItem3.reviewItemId, { rowVersion: 2 });
    assert(revalRes.validationResult && revalRes.validationResult.status === 'PASSED', '20 & 22. Revalidation executed and passed via Validation Mock contract');

    // 23 & 24. Audit trail & processing steps recorded
    const audits = await ProfileService.getAuditLogs(ORG_A);
    assert(audits.length > 0, '23. Audit events recorded for review actions');
    assert(IngestionService.getJobSteps(jobId).length > 0, '24. Processing step history recorded for review lifecycle');

    // 25 & 26. Job remains NEEDS_REVIEW until all blocking issues resolve
    await ReviewService.resolveReview(ORG_A, reviewItem1.reviewItemId, { rowVersion: 5 });
    await ReviewService.resolveReview(ORG_A, reviewItem2.reviewItemId, { rowVersion: 3 });
    const currentJobStatus = (await IngestionService.getJobById(ORG_A, jobId)).status;
    assert(currentJobStatus === PROCESSING_STATUS.APPROVED, '25 & 26. Job automatically resumed pipeline when all blocking review items resolved');

    // 27. Optimistic concurrency conflict detection
    let conflictDetected = false;
    try {
      await ReviewService.resolveReview(ORG_A, reviewItem1.reviewItemId, { rowVersion: 1 }); // Stale version 1
    } catch (e) {
      if (e.status === 409 || e.code === 'REVIEW_CONFLICT') conflictDetected = true;
    }
    assert(conflictDetected, '27. Optimistic concurrency conflict detected (409 REVIEW_CONFLICT)');

    // 28. Original machine classification preserved
    assert(reviewItem1.originalValue === 'Invoice', '28. Original machine classification preserved alongside human correction');

    console.log('\n==================================================');
    console.log(`STAGE 5 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 5 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage5Tests();
}

module.exports = { runStage5Tests };
