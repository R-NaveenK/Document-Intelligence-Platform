const { v4: uuidv4 } = require('uuid');
const ProfileService = require('./profileService');
const { PROCESSING_STATUS } = require('../../../shared/constants/statuses');
const { validateClassifierOutput } = require('../../../shared/contracts/validator');
const { makeHttpPost } = require('./orchestrator');

const inMemoryLogicalDocs = new Map();
const inMemoryDocClassifications = [];

class ClassifierService {

  static async executeClassification(organizationId, jobId, documentId, extractedPages = []) {
    const classifierUrl = process.env.CLASSIFIER_SERVICE_URL || 'http://localhost:8000';
    
    // 1. Fetch document and frozen schema
    const doc = await IngestionServiceRef().getDocumentById(organizationId, documentId);
    const profileId = doc.profile.profileId;

    // 2. Fetch allowed document types from frozen schema
    const classifierConfig = await ProfileService.getClassifierConfig(organizationId, profileId);
    const allowedTypes = classifierConfig.documentTypes || [];

    // 3. Prepare payload for FastAPI Classifier Service
    const payload = {
      jobId,
      fileId: documentId,
      schemaVersionId: doc.schemaVersionId,
      pages: extractedPages.length > 0 ? extractedPages : [
        { pageNumber: 1, text: "Sample extracted content", ocrConfidence: 0.95 }
      ],
      allowedDocumentTypes: allowedTypes
    };

    const startTime = Date.now();

    // 4. Invoke FastAPI Classifier endpoint
    const response = await makeHttpPost(`${classifierUrl}/api/v1/classify`, payload);
    validateClassifierOutput(response);

    const durationMs = Date.now() - startTime;

    // 5. Persist page classifications & logical document groups
    let jobNeedsReview = false;
    let primaryReviewReason = null;

    if (Array.isArray(response.pageClassifications)) {
      response.pageClassifications.forEach(pc => {
        const record = {
          id: uuidv4(),
          jobId,
          logicalDocumentId: null,
          pageNumber: pc.pageNumber,
          documentTypeId: pc.documentTypeId,
          documentType: pc.documentType,
          confidence: pc.confidence,
          classificationMethod: pc.classificationMethod,
          boundaryType: pc.boundary,
          requiresReview: pc.requiresReview,
          reviewReason: pc.reviewReason,
          scoresJson: pc.scores,
          createdAt: new Date().toISOString()
        };
        inMemoryDocClassifications.push(record);
        if (pc.requiresReview) {
          jobNeedsReview = true;
          if (!primaryReviewReason) primaryReviewReason = pc.reviewReason;
        }
      });
    }

    const createdLogicalDocs = [];

    if (Array.isArray(response.pageGroups)) {
      response.pageGroups.forEach(pg => {
        const logicalDocRecord = {
          logicalDocumentId: pg.logicalDocumentId || uuidv4(),
          documentId,
          organizationId,
          documentTypeId: pg.documentTypeId,
          documentType: pg.documentType,
          pages: pg.pages,
          confidence: pg.classificationConfidence,
          requiresReview: pg.requiresReview,
          reviewReason: pg.reviewReason,
          status: pg.requiresReview ? 'NEEDS_REVIEW' : 'CLASSIFIED',
          createdAt: new Date().toISOString()
        };

        inMemoryLogicalDocs.set(logicalDocRecord.logicalDocumentId, logicalDocRecord);
        createdLogicalDocs.push(logicalDocRecord);

        if (pg.requiresReview) {
          jobNeedsReview = true;
          if (!primaryReviewReason) primaryReviewReason = pg.reviewReason;
        }
      });
    }

    const finalStatus = jobNeedsReview ? PROCESSING_STATUS.NEEDS_REVIEW : PROCESSING_STATUS.CLASSIFYING;

    return {
      jobId,
      fileId: documentId,
      status: finalStatus,
      durationMs,
      requiresReview: jobNeedsReview,
      reviewReason: primaryReviewReason,
      pageClassifications: response.pageClassifications || [],
      logicalDocuments: createdLogicalDocs
    };
  }

  static getLogicalDocumentsForDocument(organizationId, documentId) {
    return Array.from(inMemoryLogicalDocs.values()).filter(ld => ld.organizationId === organizationId && ld.documentId === documentId);
  }
}

// Delayed ref resolver to prevent circular imports
function IngestionServiceRef() {
  return require('./ingestionService');
}

module.exports = ClassifierService;
