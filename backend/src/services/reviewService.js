const { v4: uuidv4 } = require('uuid');
const ProfileService = require('./profileService');
const IngestionService = require('./ingestionService');
const { REVIEW_TYPES, REVIEW_STATUS, REVIEW_REASONS } = require('../../../shared/constants/reviewConstants');
const { PROCESSING_STATUS } = require('../../../shared/constants/statuses');
const { makeHttpPost } = require('./orchestrator');

// In-Memory store for standalone & local dev execution
const inMemoryReviewItems = new Map();
const inMemoryFieldValues = new Map();

class ReviewService {

  // Factory to create review item from pipeline errors/thresholds
  static async createReviewItem(organizationId, payload) {
    const {
      jobId,
      documentId,
      logicalDocumentId = null,
      reviewType,
      reviewReason,
      sourcePage = 1,
      sourceFieldKey = null,
      originalValue = null,
      confidence = 0.0,
      metadata = {}
    } = payload;

    const reviewItemId = uuidv4();
    const reviewItem = {
      reviewItemId,
      organizationId,
      documentId,
      logicalDocumentId,
      jobId,
      reviewType: reviewType || REVIEW_TYPES.CLASSIFICATION,
      reviewReason: reviewReason || REVIEW_REASONS.LOW_CLASSIFICATION_CONFIDENCE,
      status: REVIEW_STATUS.OPEN,
      priority: 'MEDIUM',
      assignedTo: null,
      sourcePage,
      sourceFieldKey,
      originalValue,
      correctedValue: null,
      confidence,
      rowVersion: 1,
      metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null
    };

    inMemoryReviewItems.set(reviewItemId, reviewItem);

    // Update job status to NEEDS_REVIEW
    IngestionService.updateJobStatus(jobId, PROCESSING_STATUS.NEEDS_REVIEW);

    ProfileService.recordAudit(organizationId, null, 'REVIEW_CREATED', 'REVIEW_ITEM', reviewItemId, {
      reviewType,
      reviewReason,
      jobId
    });

    return reviewItem;
  }

  // List Reviews with tenant isolation & query filters
  static async listReviews(organizationId, filters = {}) {
    let items = Array.from(inMemoryReviewItems.values())
      .filter(r => r.organizationId === organizationId);

    if (filters.reviewType) items = items.filter(r => r.reviewType === filters.reviewType);
    if (filters.reviewReason) items = items.filter(r => r.reviewReason === filters.reviewReason);
    if (filters.status) items = items.filter(r => r.status === filters.status);
    if (filters.assignedTo) items = items.filter(r => r.assignedTo === filters.assignedTo);

    // Sort by createdAt descending
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Get Review Item Details
  static async getReviewById(organizationId, reviewItemId) {
    const item = inMemoryReviewItems.get(reviewItemId);
    if (!item || item.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Review item not found' };
    }

    const doc = await IngestionService.getDocumentById(organizationId, item.documentId);
    const profileId = doc ? (doc.profileId || (doc.profile && doc.profile.profileId)) : null;
    let classifierConfig = { documentTypes: [] };
    if (profileId) {
      try {
        classifierConfig = await ProfileService.getClassifierConfig(organizationId, profileId);
      } catch (e) {}
    }

    const StructuredDataService = require('./structuredDataService');
    const recordsRes = await StructuredDataService.listRecords(organizationId, { limit: 100, status: 'ALL' }).catch(() => ({ results: [] }));
    const matchingRecord = (recordsRes.results || []).find(r => r.documentId === item.documentId);

    const rawText = (doc && doc.rawText) || (doc && doc.extractionComparison ? (doc.extractionComparison.selectedExtraction?.rawText || doc.extractionComparison.comparisons?.[0]?.sampleSnippet) : null) || '';

    return {
      ...item,
      rawText,
      extractedFields: matchingRecord ? matchingRecord.fields : {},
      document: {
        originalFilename: doc ? (doc.originalFilename || doc.filename) : 'document.pdf',
        mimeType: doc ? doc.mimeType : 'application/pdf',
        fileSize: doc ? doc.fileSize : 0,
        checksum: doc ? doc.checksum : '',
        schemaVersion: doc ? doc.schemaVersion : 1,
        rawText
      },
      allowedDocumentTypes: classifierConfig.documentTypes || []
    };
  }

  // Assign Reviewer
  static async assignReviewer(organizationId, reviewItemId, assignedTo, rowVersion) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    item.assignedTo = assignedTo;
    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();

    inMemoryReviewItems.set(reviewItemId, item);

    ProfileService.recordAudit(organizationId, null, 'REVIEW_ASSIGNED', 'REVIEW_ITEM', reviewItemId, { assignedTo });
    return item;
  }

  // Start Review (State OPEN -> IN_PROGRESS)
  static async startReview(organizationId, reviewItemId, rowVersion) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    if (item.status === REVIEW_STATUS.OPEN) {
      item.status = REVIEW_STATUS.IN_PROGRESS;
    }
    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();

    inMemoryReviewItems.set(reviewItemId, item);

    ProfileService.recordAudit(organizationId, null, 'REVIEW_STARTED', 'REVIEW_ITEM', reviewItemId);
    return item;
  }

  // Correction Method 1: Classification Correction (re-extract dynamic fields for selected type)
  static async correctClassification(organizationId, reviewItemId, { documentTypeId, pageNumber, rowVersion }) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    const allowed = item.allowedDocumentTypes || [];
    const validTarget = allowed.find(dt => dt.documentTypeId === documentTypeId || dt.key === documentTypeId);
    if (!validTarget) {
      throw { code: 'INVALID_DOCUMENT_TYPE', message: `Document type ID '${documentTypeId}' is not part of the frozen schema version.` };
    }

    item.correctedValue = validTarget.name;
    item.metadata = {
      ...item.metadata,
      reviewedDocumentTypeId: validTarget.documentTypeId || validTarget.key,
      reviewedDocumentType: validTarget.name,
      correctedPage: pageNumber || item.sourcePage
    };

    item.status = REVIEW_STATUS.IN_PROGRESS;
    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();
    inMemoryReviewItems.set(reviewItemId, item);

    // Re-extract fields for newly selected document type
    const FieldExtractionService = require('./fieldExtractionService');
    const doc = await IngestionService.getDocumentById(organizationId, item.documentId);
    const rawText = doc.rawText || '';

    const newExtractedFields = FieldExtractionService.extractAndConsensus(validTarget.fields || [], [
      { engineId: 'DOC_RAW_TEXT', engineName: 'Document Text', engineMode: 'REAL', rawText, confidence: 0.95 }
    ]);

    const StructuredDataService = require('./structuredDataService');
    const recordsMap = StructuredDataService.getInMemoryRecords();
    for (const [rId, rec] of recordsMap.entries()) {
      if (rec.documentId === item.documentId) {
        await StructuredDataService.createStructuredRecord(organizationId, {
          structuredRecordId: rId,
          documentId: item.documentId,
          profileId: rec.profileId,
          documentTypeId: validTarget.documentTypeId || validTarget.key,
          schemaVersionId: rec.schemaVersionId,
          processingJobId: item.jobId,
          fields: newExtractedFields,
          validationResults: [],
          status: 'NEEDS_REVIEW'
        });
      }
    }

    ProfileService.recordAudit(organizationId, null, 'CLASSIFICATION_CORRECTED', 'REVIEW_ITEM', reviewItemId, {
      reviewedDocumentTypeId: validTarget.documentTypeId,
      name: validTarget.name
    });

    IngestionService.recordStep(item.jobId, 'HUMAN_CORRECTION_SAVED', 'SUCCESS');
    return item;
  }

  // Correction Method 2: Logical Page Grouping Correction (Split/Merge/Move)
  static async correctGrouping(organizationId, reviewItemId, { action, targetPageNumber, newDocumentTypeId, rowVersion }) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    item.metadata = {
      ...item.metadata,
      groupingAction: action,
      targetPageNumber,
      newDocumentTypeId
    };

    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();

    inMemoryReviewItems.set(reviewItemId, item);

    ProfileService.recordAudit(organizationId, null, 'PAGE_GROUPING_CORRECTED', 'REVIEW_ITEM', reviewItemId, { action, targetPageNumber });
    return item;
  }

  // Correction Method 3: Field Value Correction (Machine vs Human vs Effective Value)
  static async correctField(organizationId, reviewItemId, { fieldKey, correctedValue, rowVersion }) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    const key = fieldKey || item.sourceFieldKey;
    const machineVal = item.originalValue;

    item.sourceFieldKey = key;
    item.correctedValue = correctedValue;
    item.status = REVIEW_STATUS.IN_PROGRESS;

    // Save field value mapping: machineValue, humanValue, effectiveValue
    const fieldValueRecord = {
      fieldValueId: uuidv4(),
      organizationId,
      documentId: item.documentId,
      logicalDocumentId: item.logicalDocumentId,
      fieldKey: key,
      machineValue: machineVal,
      humanValue: correctedValue,
      effectiveValue: correctedValue !== undefined && correctedValue !== null ? correctedValue : machineVal,
      reviewStatus: 'HUMAN_REVIEWED',
      updatedAt: new Date().toISOString()
    };

    inMemoryFieldValues.set(`${item.documentId}:${key}`, fieldValueRecord);

    // Update StructuredDataService in-memory fields as well
    try {
      const StructuredDataService = require('./structuredDataService');
      const fieldsMap = StructuredDataService.getInMemoryFields();
      const recordsMap = StructuredDataService.getInMemoryRecords();
      for (const [fKey, fRec] of fieldsMap.entries()) {
        const matchingRec = recordsMap.get(fRec.structuredRecordId);
        if (matchingRec && matchingRec.documentId === item.documentId && fRec.fieldKey === key) {
          fRec.humanValue = correctedValue;
          fRec.effectiveValue = correctedValue;
          fRec.valueText = String(correctedValue);
          fRec.reviewed = true;
        }
      }
    } catch (e) {}

    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();

    inMemoryReviewItems.set(reviewItemId, item);

    const action = (correctedValue === machineVal) ? 'FIELD_CONFIRMED' : 'FIELD_CORRECTED';
    ProfileService.recordAudit(organizationId, null, action, 'REVIEW_ITEM', reviewItemId, {
      fieldKey: key,
      effectiveValue: fieldValueRecord.effectiveValue
    });

    return {
      reviewItem: item,
      fieldValue: fieldValueRecord
    };
  }

  // Revalidate Field Correction via Validation Service
  static async revalidateReview(organizationId, reviewItemId, { rowVersion } = {}) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    const validationUrl = process.env.VALIDATION_SERVICE_URL || 'http://localhost:5003';
    IngestionService.recordStep(item.jobId, 'REVALIDATION_STARTED', 'IN_PROGRESS');

    try {
      const startTime = Date.now();
      let valResult = { status: 'PASSED', errors: [] };

      // Get current structured record fields
      const StructuredDataService = require('./structuredDataService');
      const recordsMap = StructuredDataService.getInMemoryRecords();
      const fieldsMap = StructuredDataService.getInMemoryFields();

      let targetRecord = null;
      for (const [rId, rec] of recordsMap.entries()) {
        if (rec.documentId === item.documentId) {
          targetRecord = rec;
          break;
        }
      }

      const docFields = [];
      if (targetRecord) {
        for (const [fKey, fRec] of fieldsMap.entries()) {
          if (fRec.structuredRecordId === targetRecord.structuredRecordId) {
            docFields.push(fRec);
          }
        }
      }

      // Check math balance with human corrected values
      const subtotalObj = docFields.find(f => f.fieldKey.includes('subtotal') || f.fieldKey.includes('taxable'));
      const taxObj = docFields.find(f => f.fieldKey.includes('tax'));
      const totalObj = docFields.find(f => f.fieldKey === 'total_amount' || f.fieldKey === 'total' || f.fieldKey === 'final_value');

      const parseNum = (v) => {
        if (!v) return null;
        const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? null : n;
      };

      let mathPassed = true;
      if (subtotalObj && taxObj && totalObj) {
        const s = parseNum(subtotalObj.effectiveValue);
        const t = parseNum(taxObj.effectiveValue);
        const tot = parseNum(totalObj.effectiveValue);
        if (s !== null && t !== null && tot !== null) {
          const expected = parseFloat((s + t).toFixed(2));
          const actual = parseFloat(tot.toFixed(2));
          if (Math.abs(expected - actual) > 0.50) {
            mathPassed = false;
          }
        }
      }

      try {
        const res = await makeHttpPost(`${validationUrl}/api/v1/validate`, {
          logicalDocumentId: item.logicalDocumentId || item.documentId,
          fields: docFields.map(f => ({ fieldKey: f.fieldKey, value: f.effectiveValue }))
        });
        if (res && res.status === 'FAILED' && !mathPassed) {
          mathPassed = false;
        }
      } catch (err) {
        // Fallback
      }

      const durationMs = Date.now() - startTime;
      IngestionService.recordStep(item.jobId, 'REVALIDATION_COMPLETED', 'SUCCESS', durationMs);

      if (mathPassed) {
        item.status = REVIEW_STATUS.RESOLVED;
        item.resolvedAt = new Date().toISOString();
        item.rowVersion += 1;
        item.updatedAt = new Date().toISOString();
        inMemoryReviewItems.set(reviewItemId, item);

        ProfileService.recordAudit(organizationId, null, 'VALIDATION_RECHECKED', 'REVIEW_ITEM', reviewItemId, { passed: true });

        await this.evaluatePipelineResume(organizationId, item.jobId);
        return { reviewItem: item, validationResult: { status: 'PASSED', valid: true }, resolved: true };
      } else {
        item.status = REVIEW_STATUS.IN_PROGRESS;
        item.rowVersion += 1;
        item.updatedAt = new Date().toISOString();
        inMemoryReviewItems.set(reviewItemId, item);

        ProfileService.recordAudit(organizationId, null, 'VALIDATION_RECHECKED', 'REVIEW_ITEM', reviewItemId, { passed: false });
        return { reviewItem: item, validationResult: { status: 'FAILED', valid: false }, resolved: false };
      }
    } catch (err) {
      IngestionService.recordStep(item.jobId, 'REVALIDATION_FAILED', 'FAILED', 0, err.message);
      throw { code: 'REVALIDATION_ERROR', message: err.message };
    }
  }

  // Resolve Review Item
  static async resolveReview(organizationId, reviewItemId, { rowVersion } = {}) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    item.status = REVIEW_STATUS.RESOLVED;
    item.resolvedAt = new Date().toISOString();
    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();

    inMemoryReviewItems.set(reviewItemId, item);

    ProfileService.recordAudit(organizationId, null, 'REVIEW_RESOLVED', 'REVIEW_ITEM', reviewItemId);
    IngestionService.recordStep(item.jobId, 'HUMAN_REVIEW_RESOLVED', 'SUCCESS');

    // Check if all blocking review items for this job are resolved
    await this.evaluatePipelineResume(organizationId, item.jobId);

    return item;
  }

  // Reject Review Item
  static async rejectReview(organizationId, reviewItemId, { reason, rowVersion } = {}) {
    const item = await this.getReviewById(organizationId, reviewItemId);
    this.checkConcurrency(item, rowVersion);

    item.status = REVIEW_STATUS.REJECTED;
    item.resolvedAt = new Date().toISOString();
    item.metadata = { ...item.metadata, rejectionReason: reason };
    item.rowVersion += 1;
    item.updatedAt = new Date().toISOString();

    inMemoryReviewItems.set(reviewItemId, item);

    ProfileService.recordAudit(organizationId, null, 'REVIEW_REJECTED', 'REVIEW_ITEM', reviewItemId, { reason });
    return item;
  }

  // Evaluate whether all blocking items resolve and pipeline can resume to APPROVED
  static async evaluatePipelineResume(organizationId, jobId) {
    const allJobReviews = Array.from(inMemoryReviewItems.values()).filter(r => r.jobId === jobId);
    const openBlocking = allJobReviews.filter(r => r.status === REVIEW_STATUS.OPEN || r.status === REVIEW_STATUS.IN_PROGRESS);

    if (openBlocking.length === 0) {
      IngestionService.updateJobStatus(jobId, PROCESSING_STATUS.APPROVED);
      IngestionService.recordStep(jobId, 'PIPELINE_RESUMED', 'SUCCESS');

      try {
        const StructuredDataService = require('./structuredDataService');
        const recordsMap = StructuredDataService.getInMemoryRecords();
        for (const [id, rec] of recordsMap.entries()) {
          if (rec.processingJobId === jobId) {
            rec.status = 'APPROVED';
            rec.updatedAt = new Date().toISOString();
          }
        }
      } catch (e) {}
    }
  }

  // Optimistic Concurrency Control Check
  static checkConcurrency(item, incomingRowVersion) {
    if (incomingRowVersion !== undefined && incomingRowVersion !== null && incomingRowVersion !== item.rowVersion) {
      throw {
        code: 'REVIEW_CONFLICT',
        status: 409,
        message: 'Review item has been modified by another reviewer. Please refresh and try again.'
      };
    }
  }

  static clearAllReviews(organizationId) {
    let count = 0;
    for (const [id, r] of inMemoryReviewItems.entries()) {
      if (r.organizationId === organizationId) {
        inMemoryReviewItems.delete(id);
        count++;
      }
    }
    return count;
  }
}

module.exports = ReviewService;
