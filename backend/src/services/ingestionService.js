const http = require('http');
const { v4: uuidv4 } = require('uuid');
const storageService = require('./storageService');
const ProfileService = require('./profileService');
const { validateUploadedFile } = require('../utils/fileValidation');
const { PROCESSING_STATUS } = require('../../../shared/constants/statuses');
const { makeHttpPost } = require('./orchestrator');
const ComparisonEngine = require('./comparisonEngine');
const FieldExtractionService = require('./fieldExtractionService');

// In-memory stores for standalone & local dev execution
const inMemoryDocuments = new Map();
const inMemoryJobs = new Map();
const inMemorySteps = [];
const inMemoryIdempotencyCache = new Map();
const inMemoryExtractionComparisons = new Map();

// Processing worker active lock
let isWorkerRunning = false;

class IngestionService {

  // Record Processing Step
  static recordStep(jobId, stepName, status, durationMs = 0, errorMessage = null) {
    const step = {
      id: uuidv4(),
      jobId,
      stepName,
      status,
      durationMs,
      errorMessage,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    inMemorySteps.push(step);
    return step;
  }

  static getJobSteps(jobId) {
    return inMemorySteps.filter(s => s.jobId === jobId);
  }

  // Upload & Ingest File(s)
  static async ingestFiles(organizationId, profileId, files = [], idempotencyKey = null) {
    console.log(`[UPLOAD] Received ${files.length} file(s) for organizationId=${organizationId}, profileId=${profileId}`);

    // 1. Idempotency Key Check
    if (idempotencyKey) {
      const cacheKey = `${organizationId}:${idempotencyKey}`;
      if (inMemoryIdempotencyCache.has(cacheKey)) {
        return inMemoryIdempotencyCache.get(cacheKey);
      }
    }

    // 2. Validate Profile & Published Schema
    const profile = await ProfileService.getProfileById(organizationId, profileId);
    if (!profile) {
      const err = new Error(`Processing profile '${profileId}' not found`);
      err.code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    if (profile.organizationId && profile.organizationId !== organizationId) {
      const err = new Error('Access denied to processing profile for this organization');
      err.code = 'PROFILE_ACCESS_DENIED';
      throw err;
    }

    // Get profile schema and verify published version exists
    const schema = await ProfileService.getProfileSchema(organizationId, profileId);
    if (!schema || (schema.status !== 'PUBLISHED' && profile.status !== 'PUBLISHED')) {
      const err = new Error('Selected processing profile does not have a published schema version. Please publish the profile schema before uploading.');
      err.code = 'SCHEMA_NOT_PUBLISHED';
      throw err;
    }

    if (!schema.documentTypes || schema.documentTypes.length === 0) {
      const err = new Error('Published processing profile must have at least one document type configured.');
      err.code = 'NO_DOCUMENT_TYPES';
      throw err;
    }

    const frozenSchemaVersionId = profile.currentSchemaVersionId || (schema && schema.schemaVersionId) || uuidv4();
    const frozenSchemaVersionNumber = profile.currentSchemaVersion || (schema && schema.versionNumber) || 1;

    if (!files || files.length === 0) {
      const err = new Error('At least one file must be provided for upload.');
      err.code = 'NO_FILES_PROVIDED';
      throw err;
    }

    const maxFiles = parseInt(process.env.MAX_FILES_PER_UPLOAD || '20', 10);
    if (files.length > maxFiles) {
      const err = new Error(`Cannot upload more than ${maxFiles} files per batch upload.`);
      err.code = 'EXCEEDED_MAX_FILES';
      throw err;
    }

    const batchId = uuidv4();
    const batchRecord = {
      batchId,
      organizationId,
      profileId,
      schemaVersionId: frozenSchemaVersionId,
      totalFiles: files.length,
      completedFiles: 0,
      failedFiles: 0,
      reviewRequiredFiles: 0,
      createdAt: new Date().toISOString()
    };

    const uploadResults = [];
    const FileTypeRouter = require('./fileTypeRouter');

    for (const rawFile of files) {
      let documentId = uuidv4();
      let jobId = uuidv4();
      let sanitizedFilename = rawFile.originalname || rawFile.name || 'unnamed.bin';

      try {
        // Step 1: Validate file buffer & signature (PDF, PNG, JPG, JPEG, DOC, DOCX, XLS, XLSX)
        const validated = validateUploadedFile(rawFile);
        sanitizedFilename = validated.sanitizedFilename;

        // Step 2: SHA-256 Duplicate Check per Organization
        const existingDuplicate = Array.from(inMemoryDocuments.values()).find(
          d => d.organizationId === organizationId && d.checksum === validated.checksum
        );

        if (existingDuplicate) {
          batchRecord.failedFiles++;
          ProfileService.recordAudit(organizationId, null, 'DUPLICATE_UPLOAD_ATTEMPTED', 'DOCUMENT', existingDuplicate.documentId, {
            filename: sanitizedFilename,
            checksum: validated.checksum
          });

          uploadResults.push({
            filename: sanitizedFilename,
            status: 'DUPLICATE',
            duplicateDocumentId: existingDuplicate.documentId,
            success: false,
            error: {
              code: 'DUPLICATE_DOCUMENT',
              message: `Document '${sanitizedFilename}' already exists in your organization.`
            }
          });
          continue;
        }

        // Step 3: Store Original File immediately using Storage Abstraction
        const storageResult = await storageService.storeFile(
          organizationId,
          documentId,
          validated.buffer,
          sanitizedFilename
        );

        // Step 4: Route file type & normalize extraction payload (Word, Excel, PDF, Image)
        const normalized = await FileTypeRouter.processAndNormalize(validated, jobId, documentId);

        // Step 5: Save Document DB Record with batch reference & source format
        const documentRecord = {
          documentId,
          batchId,
          organizationId,
          profileId,
          schemaVersionId: frozenSchemaVersionId,
          schemaVersionNumber: frozenSchemaVersionNumber,
          originalFilename: sanitizedFilename,
          storageKey: storageResult.storageKey,
          mimeType: validated.mimeType,
          fileSize: validated.sizeBytes,
          checksum: validated.checksum,
          sourceFormat: normalized.sourceFormat,
          logicalUnits: normalized.logicalUnits,
          status: 'UPLOADED',
          createdAt: new Date().toISOString()
        };
        inMemoryDocuments.set(documentId, documentRecord);
        console.log(`[DATABASE] Document persisted: documentId=${documentId}, filename=${sanitizedFilename}`);

        // Step 6: Save Processing Job (Frozen Schema Version, Status QUEUED)
        const jobRecord = {
          jobId,
          organizationId,
          documentId,
          processingProfileId: profileId,
          schemaVersionId: frozenSchemaVersionId,
          schemaVersionNumber: frozenSchemaVersionNumber,
          status: PROCESSING_STATUS.QUEUED,
          currentStage: 'QUEUED',
          retryCount: 0,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        inMemoryJobs.set(jobId, jobRecord);
        console.log(`[QUEUE] Job created: jobId=${jobId}, status=QUEUED`);

        // Step 7: Record Processing Steps & Audits
        this.recordStep(jobId, 'UPLOAD_RECEIVED', 'SUCCESS');
        this.recordStep(jobId, 'FILE_VALIDATED', 'SUCCESS');
        this.recordStep(jobId, 'DUPLICATE_CHECKED', 'SUCCESS');
        this.recordStep(jobId, 'FILE_STORED', 'SUCCESS');
        this.recordStep(jobId, 'FILE_ROUTED_PARSED', 'SUCCESS');
        this.recordStep(jobId, 'JOB_CREATED', 'SUCCESS');

        ProfileService.recordAudit(organizationId, null, 'DOCUMENT_UPLOADED', 'DOCUMENT', documentId, {
          filename: sanitizedFilename,
          jobId,
          batchId
        });

        batchRecord.completedFiles++;
        uploadResults.push({
          documentId,
          jobId,
          profileId,
          batchId,
          schemaVersion: frozenSchemaVersionNumber,
          filename: sanitizedFilename,
          sourceFormat: normalized.sourceFormat,
          status: PROCESSING_STATUS.QUEUED,
          success: true
        });

        // Trigger worker processing immediately (non-blocking)
        setImmediate(() => {
          this.processJob(jobId, documentId, storageResult.storageKey, validated.buffer);
        });

      } catch (err) {
        batchRecord.failedFiles++;
        console.error(`[UPLOAD ERROR] File '${sanitizedFilename}' upload failed:`, err.message);

        ProfileService.recordAudit(organizationId, null, 'DOCUMENT_UPLOAD_FAILED', 'DOCUMENT', documentId, {
          filename: sanitizedFilename,
          error: err.message
        });

        uploadResults.push({
          filename: sanitizedFilename,
          status: 'REJECTED',
          success: false,
          error: {
            code: err.code || 'UPLOAD_FAILED',
            message: err.message || err.toString()
          }
        });
      }
    }

    const responsePayload = (files.length === 1)
      ? uploadResults[0]
      : {
          batchId,
          totalFiles: files.length,
          files: uploadResults,
          uploads: uploadResults
        };

    // Cache result if idempotency key was provided
    if (idempotencyKey) {
      inMemoryIdempotencyCache.set(`${organizationId}:${idempotencyKey}`, responsePayload);
    }

    return responsePayload;
  }

  // Atomic state transition helper
  static transitionJobState(jobId, newStatus, currentStage = null, extraFields = {}) {
    const job = inMemoryJobs.get(jobId);
    if (!job) return null;

    job.status = newStatus;
    if (currentStage) job.currentStage = currentStage;
    job.updatedAt = new Date().toISOString();

    if (newStatus === 'EXTRACTING' && !job.startedAt) {
      job.startedAt = new Date().toISOString();
    }
    if (['APPROVED', 'NEEDS_REVIEW', 'FAILED'].includes(newStatus)) {
      job.completedAt = new Date().toISOString();
    }

    Object.assign(job, extraFields);
    inMemoryJobs.set(jobId, job);

    const doc = inMemoryDocuments.get(job.documentId);
    if (doc) {
      doc.status = newStatus;
      inMemoryDocuments.set(job.documentId, doc);
    }

    return job;
  }

  // Master Processing Worker: consumes and executes one job through the 11-stage pipeline
  static async processJob(jobId, documentId, storageKey = null, directBuffer = null) {
    const job = inMemoryJobs.get(jobId);
    if (!job || job.status === 'EXTRACTING' || job.status === 'APPROVED') {
      return;
    }

    const doc = inMemoryDocuments.get(documentId);
    if (!doc) {
      console.error(`[WORKER] Document not found for documentId=${documentId}`);
      return;
    }

    const organizationId = doc.organizationId;
    console.log(`[WORKER] Starting processing: jobId=${jobId}, documentId=${documentId}, organizationId=${organizationId}`);

    try {
      // ==========================================
      // STAGE 1: EXTRACTION (QUEUED -> EXTRACTING -> EXTRACTED)
      // ==========================================
      this.transitionJobState(jobId, 'EXTRACTING', 'EXTRACTION');
      this.recordStep(jobId, 'EXTRACTION_STARTED', 'IN_PROGRESS');
      const startExtraction = Date.now();

      let fileBuffer = directBuffer || null;
      if (!fileBuffer && doc) {
        try {
          const fileRes = await storageService.getFile(doc.organizationId, documentId);
          fileBuffer = fileRes.buffer;
        } catch (e) {}
      }

      const filename = doc.originalFilename || 'document.pdf';
      const mimeType = doc.mimeType || 'application/pdf';

      console.log(`[EXTRACTION] Running multi-engine extraction on filename=${filename}`);
      const comparisonRes = await ComparisonEngine.runExtractionAndComparison({
        buffer: fileBuffer,
        filename,
        mimeType,
        jobId,
        documentId,
        organizationId,
        storageKey
      });

      const extractionDuration = Date.now() - startExtraction;
      this.recordStep(jobId, 'EXTRACTION_COMPLETED', 'SUCCESS', extractionDuration);
      this.transitionJobState(jobId, 'EXTRACTED', 'EXTRACTION');
      console.log(`[CONSENSUS] Winner: engine=${comparisonRes.winner.engineName}, score=${comparisonRes.winner.totalScore}`);

      doc.extractionComparison = comparisonRes.comparisonReport;
      doc.winningEngine = comparisonRes.winner.engineName;
      doc.winningScore = comparisonRes.winner.totalScore;
      doc.rawText = comparisonRes.winningExtraction.rawText || '';
      inMemoryDocuments.set(documentId, doc);
      inMemoryExtractionComparisons.set(documentId, comparisonRes.comparisonReport);

      // ==========================================
      // STAGE 2: CLASSIFICATION (EXTRACTED -> CLASSIFYING -> CLASSIFIED)
      // ==========================================
      this.transitionJobState(jobId, 'CLASSIFYING', 'CLASSIFICATION');
      this.recordStep(jobId, 'CLASSIFICATION_STARTED', 'IN_PROGRESS');
      const startClassify = Date.now();

      let schema = null;
      try {
        schema = await ProfileService.getProfileSchema(organizationId, doc.profileId);
      } catch (e) {}

      const docTypes = (schema && schema.documentTypes && schema.documentTypes.length > 0)
        ? schema.documentTypes
        : [{ documentTypeId: 'default_dt', name: 'Standard Document', key: 'standard_document', fields: [] }];

      const winningText = comparisonRes.winningExtraction.rawText || '';

      // Match document type generically from configured schema
      let matchedDocType = null;
      let highestMatchScore = 0;

      for (const dt of docTypes) {
        let score = 0;
        const keywords = [dt.name, dt.key, ...(dt.aliases || [])].filter(Boolean).map(k => k.toLowerCase());
        for (const kw of keywords) {
          if (winningText.toLowerCase().includes(kw)) {
            score += kw.length;
          }
        }
        if (score > highestMatchScore) {
          highestMatchScore = score;
          matchedDocType = dt;
        }
      }

      if (!matchedDocType) {
        matchedDocType = docTypes[0];
      }

      const classificationConfidence = highestMatchScore > 0 ? 0.92 : 0.60;
      const isClassificationUncertain = classificationConfidence < 0.70;

      this.recordStep(jobId, 'CLASSIFICATION_COMPLETED', 'SUCCESS', Date.now() - startClassify);
      this.transitionJobState(jobId, 'CLASSIFIED', 'CLASSIFICATION');
      console.log(`[CLASSIFICATION] Matched documentType=${matchedDocType.name} (key=${matchedDocType.key}), confidence=${classificationConfidence}`);

      // ==========================================
      // STAGE 3: DYNAMIC FIELD EXTRACTION & CONSENSUS CASCADE
      // ==========================================
      this.transitionJobState(jobId, 'STRUCTURING', 'STRUCTURING');
      this.recordStep(jobId, 'STRUCTURING_STARTED', 'IN_PROGRESS');
      const startStructuring = Date.now();

      const fieldDefinitions = matchedDocType.fields || [];
      console.log(`[FIELD_EXTRACTION] Extracting ${fieldDefinitions.length} dynamic fields for type=${matchedDocType.key}`);

      // Extract fields across all available engine extraction outputs using cascade & consensus
      const extractedFields = FieldExtractionService.extractAndConsensus(
        fieldDefinitions,
        comparisonRes.allExtractions || [comparisonRes.winningExtraction]
      );

      // Invoke Structuring Layer service on port 5002 if available
      const structuringUrl = process.env.STRUCTURING_SERVICE_URL || 'http://localhost:5002';
      try {
        await makeHttpPost(`${structuringUrl}/api/v1/structure`, {
          logicalDocumentId: documentId,
          documentTypeId: matchedDocType.key,
          schemaVersion: doc.schemaVersionNumber || 1,
          fields: extractedFields.map(f => ({
            fieldKey: f.fieldKey,
            dataType: f.dataType,
            value: f.effectiveValue,
            name: f.displayName
          })),
          rawText: winningText
        });
      } catch (structErr) {
        // Structuring layer graceful degradation
      }

      this.recordStep(jobId, 'STRUCTURING_COMPLETED', 'SUCCESS', Date.now() - startStructuring);
      this.transitionJobState(jobId, 'STRUCTURED', 'STRUCTURING');

      // ==========================================
      // STAGE 4: STORE STRUCTURED RECORD AS DRAFT BEFORE VALIDATION (Mandatory!)
      // ==========================================
      const StructuredDataService = require('./structuredDataService');
      const ReviewService = require('./reviewService');

      let structuredRecord = await StructuredDataService.createStructuredRecord(organizationId, {
        documentId,
        profileId: doc.profileId,
        documentTypeId: matchedDocType.documentTypeId || matchedDocType.key,
        schemaVersionId: doc.schemaVersionId,
        processingJobId: jobId,
        fields: extractedFields,
        validationResults: [],
        status: 'DRAFT'
      });
      console.log(`[DATABASE] StructuredRecord created as DRAFT: recordId=${structuredRecord.structuredRecordId}`);

      // ==========================================
      // STAGE 5: VALIDATION ENGINE & ARITHMETIC INTEGRITY
      // ==========================================
      this.transitionJobState(jobId, 'VALIDATING', 'VALIDATION');
      this.recordStep(jobId, 'VALIDATION_STARTED', 'IN_PROGRESS');
      const startValidation = Date.now();

      const validationResults = [];
      let requiresReview = isClassificationUncertain;
      let reviewReason = isClassificationUncertain ? 'CLASSIFICATION_UNCERTAIN' : null;

      // Remote validation engine call on Port 5003
      const validationUrl = process.env.VALIDATION_SERVICE_URL || 'http://localhost:5003';
      try {
        const valPayload = {
          logicalDocumentId: documentId,
          documentId,
          documentTypeId: matchedDocType.key,
          organizationId,
          fields: extractedFields.map(f => ({
            fieldKey: f.fieldKey,
            effectiveValue: f.effectiveValue,
            value: f.effectiveValue
          })),
          raw_data: {
            document_id: documentId,
            ...extractedFields.reduce((acc, f) => { acc[f.fieldKey] = f.effectiveValue; return acc; }, {})
          }
        };

        const valResponse = await new Promise((resolve) => {
          const postData = JSON.stringify(valPayload);
          const req = http.request({
            hostname: 'localhost',
            port: 5003,
            path: '/validate',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 3000
          }, (res) => {
            let b = '';
            res.on('data', chunk => b += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(b)); } catch (e) { resolve(null); }
            });
          });
          req.on('error', () => resolve(null));
          req.on('timeout', () => { req.destroy(); resolve(null); });
          req.write(postData);
          req.end();
        });

        if (valResponse && valResponse.validationResults) {
          for (const vr of valResponse.validationResults) {
            validationResults.push({
              ruleName: vr.type || vr.validator || 'VALIDATION_CHECK',
              validationType: 'BUSINESS_LOGIC_ASSERTION',
              passed: vr.passed,
              severity: vr.severity,
              message: vr.message
            });
          }
        }
      } catch (valErr) {
        // Fallback
      }

      // Multi-Tier Arithmetic Assertions
      const subtotalObj = extractedFields.find(f => f.fieldKey.includes('subtotal') || f.fieldKey.includes('taxable') || f.fieldKey.includes('base'));
      const taxObj = extractedFields.find(f => f.fieldKey.includes('tax'));
      const totalObj = extractedFields.find(f => f.fieldKey === 'total_amount' || f.fieldKey === 'total' || f.fieldKey === 'final_value' || f.fieldKey === 'grand_total' || (f.fieldKey.includes('amount') && !f.fieldKey.includes('tax') && !f.fieldKey.includes('subtotal')));

      const parseNum = (val) => {
        if (val === null || val === undefined) return null;
        const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? null : n;
      };

      const subtotalVal = subtotalObj ? parseNum(subtotalObj.machineValue) : null;
      const taxVal = taxObj ? parseNum(taxObj.machineValue) : null;
      const totalVal = totalObj ? parseNum(totalObj.machineValue) : null;

      if (subtotalVal !== null && taxVal !== null && totalVal !== null) {
        const expectedTotal = parseFloat((subtotalVal + taxVal).toFixed(2));
        const actualTotal = parseFloat(totalVal.toFixed(2));
        const diff = Math.abs(expectedTotal - actualTotal);

        if (diff > 0.50) {
          requiresReview = true;
          reviewReason = 'ARITHMETIC_MISMATCH';
          validationResults.push({
            ruleName: 'ARITHMETIC_INTEGRITY_CHECK',
            validationType: 'MATH_ASSERTION',
            passed: false,
            message: `Arithmetic Anomaly: Subtotal (${subtotalVal}) + Tax (${taxVal}) = ${expectedTotal}, but Total was ${actualTotal} (Mismatch of ${diff.toFixed(2)}).`
          });
        } else {
          validationResults.push({
            ruleName: 'ARITHMETIC_INTEGRITY_CHECK',
            validationType: 'MATH_ASSERTION',
            passed: true,
            message: `Arithmetic verified: Subtotal (${subtotalVal}) + Tax (${taxVal}) = Total (${actualTotal}).`
          });
        }
      }

      // Check data fields extraction:
      // Only require review if ALL data fields are missing / empty (i.e. complete extraction failure)
      const populatedFields = extractedFields.filter(f => f.machineValue !== null && f.machineValue !== undefined && String(f.machineValue).trim() !== '');

      if (fieldDefinitions.length > 0 && populatedFields.length === 0) {
        requiresReview = true;
        if (!reviewReason) reviewReason = 'ALL_FIELDS_MISSING';
        validationResults.push({
          ruleName: 'DATA_FIELDS_CHECK',
          validationType: 'SCHEMA_ASSERTION',
          passed: false,
          message: `All ${fieldDefinitions.length} schema fields are unreadable or missing from document.`
        });
      } else {
        validationResults.push({
          ruleName: 'DATA_FIELDS_CHECK',
          validationType: 'SCHEMA_ASSERTION',
          passed: true,
          message: `${populatedFields.length} of ${fieldDefinitions.length} data fields extracted successfully.`
        });
      }

      this.recordStep(jobId, 'VALIDATION_COMPLETED', 'SUCCESS', Date.now() - startValidation);

      const finalStatus = requiresReview ? PROCESSING_STATUS.NEEDS_REVIEW : PROCESSING_STATUS.APPROVED;
      console.log(`[VALIDATION] Outcome for jobId=${jobId}: status=${finalStatus}, requiresReview=${requiresReview}, reason=${reviewReason}`);

      // Update StructuredRecord status and validation results
      structuredRecord = await StructuredDataService.createStructuredRecord(organizationId, {
        structuredRecordId: structuredRecord.structuredRecordId,
        documentId,
        profileId: doc.profileId,
        documentTypeId: matchedDocType.documentTypeId || matchedDocType.key,
        schemaVersionId: doc.schemaVersionId,
        processingJobId: jobId,
        fields: extractedFields,
        validationResults,
        status: finalStatus
      });

      // If review required, create ReviewItem in review queue
      if (requiresReview) {
        const reviewItem = await ReviewService.createReviewItem(organizationId, {
          jobId,
          documentId,
          reviewType: reviewReason === 'CLASSIFICATION_UNCERTAIN' ? 'CLASSIFICATION' : 'VALIDATION',
          reviewReason: reviewReason || 'VALIDATION_FAILED',
          confidence: classificationConfidence,
          sourceFieldKey: totalObj ? totalObj.fieldKey : (extractedFields[0]?.fieldKey || null),
          originalValue: totalObj ? totalObj.machineValue : null,
          metadata: {
            missingFields: populatedFields.length === 0 ? fieldDefinitions.map(f => f.fieldKey || f.key) : [],
            validationResults
          }
        });
        console.log(`[REVIEW] Created reviewItem: id=${reviewItem.reviewItemId}, reason=${reviewReason}`);
      }

      // Final job and document state transition
      this.transitionJobState(jobId, finalStatus, 'COMPLETED');
      this.recordStep(jobId, 'PIPELINE_COMPLETED', 'SUCCESS');

      return {
        jobId,
        documentId,
        status: finalStatus,
        structuredRecordId: structuredRecord.structuredRecordId
      };

    } catch (err) {
      console.error(`[PIPELINE ERROR] Job ${jobId} failed:`, err.message);
      this.transitionJobState(jobId, PROCESSING_STATUS.FAILED, 'FAILED', {
        errorCode: err.code || 'PROCESSING_ERROR',
        errorMessage: err.message || err.toString()
      });
      this.recordStep(jobId, 'PIPELINE_FAILED', 'FAILED', 0, err.message);
    }
  }

  // Background Worker Loop
  static async startWorker() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;
    console.log('[WORKER] IDP Processing Worker daemon started.');

    setInterval(async () => {
      try {
        const queuedJobs = Array.from(inMemoryJobs.values()).filter(j => j.status === PROCESSING_STATUS.QUEUED);
        for (const job of queuedJobs) {
          await this.processJob(job.jobId, job.documentId);
        }
      } catch (err) {
        console.error('[WORKER ERROR]', err.message);
      }
    }, 1000);
  }

  // Retry Failed Job
  static async retryJob(organizationId, jobId) {
    const job = inMemoryJobs.get(jobId);
    if (!job || job.organizationId !== organizationId) {
      throw { code: 'JOB_NOT_FOUND', message: 'Processing job not found' };
    }

    job.retryCount += 1;
    this.transitionJobState(jobId, PROCESSING_STATUS.QUEUED, 'RETRYING');
    this.recordStep(jobId, 'JOB_RETRIED', 'IN_PROGRESS');

    ProfileService.recordAudit(organizationId, null, 'PROCESSING_RETRIED', 'JOB', jobId, {
      retryCount: job.retryCount
    });

    const doc = inMemoryDocuments.get(job.documentId);

    setImmediate(() => {
      this.processJob(jobId, job.documentId, doc ? doc.storageKey : null);
    });

    return {
      jobId: job.jobId,
      documentId: job.documentId,
      status: job.status,
      retryCount: job.retryCount
    };
  }

  // List Documents for Organization with filters
  static async listDocuments(organizationId, { profileId, status, filename } = {}) {
    let docs = Array.from(inMemoryDocuments.values())
      .filter(d => d.organizationId === organizationId);

    if (profileId) docs = docs.filter(d => d.profileId === profileId);
    if (status) docs = docs.filter(d => d.status === status);
    if (filename) docs = docs.filter(d => (d.originalFilename || '').toLowerCase().includes(filename.toLowerCase()));

    return docs.map(d => {
      const job = Array.from(inMemoryJobs.values()).find(j => j.documentId === d.documentId);
      return {
        ...d,
        jobId: job ? job.jobId : null,
        jobStatus: job ? job.status : d.status
      };
    });
  }

  // Get Document Details
  static async getDocumentById(organizationId, documentId) {
    const doc = inMemoryDocuments.get(documentId);
    if (!doc || doc.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Document not found' };
    }

    const profile = await ProfileService.getProfileById(organizationId, doc.profileId);
    const job = Array.from(inMemoryJobs.values()).find(j => j.documentId === documentId);
    const steps = job ? inMemorySteps.filter(s => s.jobId === job.jobId) : [];

    return {
      documentId: doc.documentId,
      organizationId: doc.organizationId,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      checksum: doc.checksum,
      status: doc.status,
      createdAt: doc.createdAt,
      profile: {
        profileId: profile ? profile.profileId : doc.profileId,
        name: profile ? profile.name : 'Unknown'
      },
      schemaVersion: doc.schemaVersionNumber,
      schemaVersionId: doc.schemaVersionId,
      extractionComparison: inMemoryExtractionComparisons.get(documentId) || doc.extractionComparison || null,
      winningEngine: doc.winningEngine || (doc.extractionComparison ? doc.extractionComparison.winningEngineName : null),
      winningScore: doc.winningScore || (doc.extractionComparison ? doc.extractionComparison.winningScore : null),
      rawText: doc.rawText || '',
      job: job ? {
        jobId: job.jobId,
        status: job.status,
        currentStage: job.currentStage,
        retryCount: job.retryCount,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt
      } : null,
      steps
    };
  }

  // Get Extraction Comparison Report for Document
  static async getExtractionComparison(organizationId, documentId) {
    const doc = inMemoryDocuments.get(documentId);
    if (!doc || doc.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Document not found' };
    }

    const report = inMemoryExtractionComparisons.get(documentId) || doc.extractionComparison;
    if (!report) {
      let fileBuffer = null;
      try {
        if (doc.storageKey) fileBuffer = await storageService.getFile(doc.organizationId, documentId);
      } catch (e) {}

      const compRes = await ComparisonEngine.runExtractionAndComparison({
        buffer: fileBuffer ? fileBuffer.buffer : null,
        filename: doc.originalFilename || 'document.pdf',
        mimeType: doc.mimeType || 'application/pdf',
        jobId: doc.jobId || 'job_001',
        documentId,
        organizationId
      });

      inMemoryExtractionComparisons.set(documentId, compRes.comparisonReport);
      doc.extractionComparison = compRes.comparisonReport;
      doc.winningEngine = compRes.winner.engineName;
      doc.winningScore = compRes.winner.totalScore;
      doc.rawText = compRes.winningExtraction.rawText || '';
      inMemoryDocuments.set(documentId, doc);

      return compRes.comparisonReport;
    }

    return report;
  }

  static updateJobStatus(jobId, status) {
    const job = inMemoryJobs.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date().toISOString();
      if (['APPROVED', 'NEEDS_REVIEW'].includes(status)) {
        job.completedAt = new Date().toISOString();
      }
      const doc = inMemoryDocuments.get(job.documentId);
      if (doc) {
        doc.status = status;
      }
    }
    return job;
  }

  // Get Processing Job Status
  static async getJobById(organizationId, jobId) {
    const job = inMemoryJobs.get(jobId);
    if (!job || job.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Processing job not found' };
    }

    const steps = inMemorySteps.filter(s => s.jobId === jobId);

    return {
      jobId: job.jobId,
      documentId: job.documentId,
      status: job.status,
      currentStage: job.currentStage,
      retryCount: job.retryCount,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      currentStep: steps.length > 0 ? steps[steps.length - 1].stepName : 'QUEUED',
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      steps
    };
  }

  // Delete Individual Document
  static async deleteDocument(organizationId, documentId) {
    const doc = inMemoryDocuments.get(documentId);
    if (!doc || doc.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', status: 404, message: 'Document not found' };
    }
    inMemoryDocuments.delete(documentId);
    inMemoryExtractionComparisons.delete(documentId);
    return { deleted: true, documentId };
  }

  // Clear All Ingested Documents
  static async clearAllDocuments(organizationId) {
    let count = 0;
    for (const [id, doc] of inMemoryDocuments.entries()) {
      if (doc.organizationId === organizationId) {
        inMemoryDocuments.delete(id);
        inMemoryExtractionComparisons.delete(id);
        count++;
      }
    }
    for (const [id, job] of inMemoryJobs.entries()) {
      if (job.organizationId === organizationId) inMemoryJobs.delete(id);
    }
    try {
      const ReviewService = require('./reviewService');
      ReviewService.clearAllReviews(organizationId);
      const StructuredDataService = require('./structuredDataService');
      StructuredDataService.clearAllRecords(organizationId);
    } catch (e) {}

    return { clearedCount: count };
  }
}

// Start background worker daemon immediately
IngestionService.startWorker();

module.exports = IngestionService;
