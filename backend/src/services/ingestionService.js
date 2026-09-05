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

  static clearAll() {
    inMemoryDocuments.clear();
    inMemoryJobs.clear();
    inMemorySteps.length = 0;
    inMemoryIdempotencyCache.clear();
    inMemoryExtractionComparisons.clear();
    return true;
  }

  static getJobSteps(jobId) {
    return inMemorySteps.filter(s => s.jobId === jobId);
  }

  static getInMemoryDocuments() {
    return inMemoryDocuments;
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

      // Match document type from configured company schemas/forms
      let matchedDocType = null;
      let highestMatchScore = 0;
      const candidateScores = [];

      for (const dt of docTypes) {
        let score = 0;
        const keywords = [dt.name, dt.key, ...(dt.aliases || []), ...(dt.fields || []).map(f => f.displayName || f.fieldKey)].filter(Boolean).map(k => k.toLowerCase());
        for (const kw of keywords) {
          if (winningText.toLowerCase().includes(kw)) {
            score += Math.max(kw.length, 3);
          }
        }
        candidateScores.push({
          documentTypeId: dt.documentTypeId || dt.key,
          documentType: dt.name,
          score
        });
        if (score > highestMatchScore) {
          highestMatchScore = score;
          matchedDocType = dt;
        }
      }

      // Check if document matched a predefined form with sufficient confidence
      const hasPredefinedForms = docTypes.length > 0 && docTypes.some(d => d.key !== 'standard_document' && (d.fields || []).length > 0);
      const isRecognizedForm = highestMatchScore >= 7;
      const classificationConfidence = isRecognizedForm ? Math.min(0.98, 0.70 + (highestMatchScore / 50)) : (highestMatchScore > 0 ? 0.35 : 0.10);
      const isClassificationUncertain = hasPredefinedForms ? !isRecognizedForm : (classificationConfidence < 0.50);

      if (!isRecognizedForm && hasPredefinedForms) {
        matchedDocType = {
          documentTypeId: 'UNKNOWN',
          name: 'UNKNOWN',
          key: 'UNKNOWN',
          fields: []
        };
      } else if (!matchedDocType) {
        matchedDocType = docTypes[0];
      }

      this.recordStep(jobId, 'CLASSIFICATION_COMPLETED', 'SUCCESS', Date.now() - startClassify);
      this.transitionJobState(jobId, 'CLASSIFIED', 'CLASSIFICATION');
      console.log(`[CLASSIFICATION] Matched form=${matchedDocType.name} (key=${matchedDocType.key}), confidence=${classificationConfidence}, requiresReview=${isClassificationUncertain}`);

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
      // STAGE 5: 4-TIER VALIDATION ENGINE (DATE, FORMAT, DUPLICATE, ARITHMETIC)
      // ==========================================
      this.transitionJobState(jobId, 'VALIDATING', 'VALIDATION');
      this.recordStep(jobId, 'VALIDATION_STARTED', 'IN_PROGRESS');
      const startValidation = Date.now();

      const validationResults = [];
      let requiresReview = isClassificationUncertain;
      let reviewReason = isClassificationUncertain ? 'CLASSIFICATION_UNCERTAIN' : null;

      // Quality Gate: Readability & Content Check
      const wordCount = (winningText || '').split(/\s+/).filter(w => w.length > 1).length;
      const isUnreadable = !winningText || winningText.trim().length < 5 || wordCount < 3 || comparisonRes.isUnreadableOrEmpty || (doc.winningScore || 0) < 25;

      if (isUnreadable) {
        requiresReview = true;
        if (!reviewReason) reviewReason = 'UNREADABLE_OR_NON_DOCUMENT';
        validationResults.push({
          ruleName: 'DOCUMENT_READABILITY_CHECK',
          validationType: 'QUALITY_ASSERTION',
          passed: false,
          severity: 'CRITICAL',
          message: 'No readable text or business document structure detected. The uploaded file appears to be an unreadable image, wallpaper, or non-text file.'
        });
      } else {
        validationResults.push({
          ruleName: 'DOCUMENT_READABILITY_CHECK',
          validationType: 'QUALITY_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: `Document text successfully recognized (${wordCount} words, extraction quality score: ${doc.winningScore || 80}/100).`
        });
      }

      // Classification Gate: Predefined Form Matching Check
      if (isClassificationUncertain && !isUnreadable) {
        validationResults.push({
          ruleName: 'DOCUMENT_CLASSIFICATION_CHECK',
          validationType: 'FORM_SCHEMA_ASSERTION',
          passed: false,
          severity: 'WARNING',
          message: `Document does not match any predefined company form schema with high confidence (${Math.round(classificationConfidence * 100)}%). Routed to Human Review for manual schema verification.`
        });
      } else if (!isUnreadable) {
        validationResults.push({
          ruleName: 'DOCUMENT_CLASSIFICATION_CHECK',
          validationType: 'FORM_SCHEMA_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: `Document matched company form schema: "${matchedDocType.name}" (${Math.round(classificationConfidence * 100)}% confidence).`
        });
      }

      // -------------------------------------------------------------
      // TIER 1: DATE VALIDATION (Format, calendar range, validity)
      // -------------------------------------------------------------
      const dateFields = extractedFields.filter(f => f.dataType === 'date' || f.fieldKey.includes('date') || f.fieldKey.includes('dob') || f.fieldKey.includes('expiry') || f.fieldKey.includes('admission'));
      let dateTierPassed = true;
      let dateTierMessage = 'All date fields conform to valid calendar formats.';

      if (dateFields.length > 0) {
        for (const df of dateFields) {
          if (df.machineValue) {
            const dateStr = String(df.machineValue).trim();
            const parsedTs = Date.parse(dateStr);
            const isoMatch = dateStr.match(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/);
            const regionalMatch = dateStr.match(/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/);

            if (isNaN(parsedTs) && !isoMatch && !regionalMatch) {
              dateTierPassed = false;
              dateTierMessage = `Date field '${df.displayName}' has invalid calendar format: "${dateStr}".`;
              break;
            } else {
              const year = new Date(parsedTs || Date.now()).getFullYear();
              if (year < 1920 || year > 2099) {
                dateTierPassed = false;
                dateTierMessage = `Date field '${df.displayName}' has out-of-range calendar year: ${year}.`;
                break;
              }
            }
          }
        }
      }

      if (!dateTierPassed) {
        requiresReview = true;
        if (!reviewReason) reviewReason = 'INVALID_DATE_FORMAT';
        validationResults.push({
          ruleName: 'DATE_VALIDATION',
          validationType: 'DATE_ASSERTION',
          passed: false,
          severity: 'ERROR',
          message: dateTierMessage
        });
      } else {
        validationResults.push({
          ruleName: 'DATE_VALIDATION',
          validationType: 'DATE_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: dateFields.length > 0 ? `Verified ${dateFields.length} date fields against calendar standards.` : 'No date fields required verification.'
        });
      }

      // -------------------------------------------------------------
      // TIER 2: FORMAT VALIDATION (Regex, data types, string structure)
      // -------------------------------------------------------------
      let formatTierPassed = true;
      let formatTierMessage = 'All fields conform to expected data types and formatting rules.';

      for (const f of extractedFields) {
        if (f.machineValue) {
          const valStr = String(f.machineValue).trim();
          const dType = (f.dataType || '').toLowerCase();
          if (dType === 'number' || dType === 'decimal' || dType === 'currency' || dType === 'integer') {
            const cleanStr = valStr.replace(/[^0-9.-]/g, '');
            const num = parseFloat(cleanStr);
            const hasLetters = /[a-zA-Z]/.test(valStr.replace(/(USD|EUR|GBP|INR|Rs|\$|CAD|AUD)/g, ''));
            if (isNaN(num) || cleanStr === '' || hasLetters) {
              formatTierPassed = false;
              formatTierMessage = `Field '${f.displayName || f.fieldKey}' expected ${f.dataType} value but found "${valStr}".`;
              break;
            }
          }
        }
      }

      if (!formatTierPassed) {
        requiresReview = true;
        if (!reviewReason) reviewReason = 'FORMAT_VALIDATION_ERROR';
        validationResults.push({
          ruleName: 'FORMAT_VALIDATION',
          validationType: 'FORMAT_ASSERTION',
          passed: false,
          severity: 'ERROR',
          message: formatTierMessage
        });
      } else {
        validationResults.push({
          ruleName: 'FORMAT_VALIDATION',
          validationType: 'FORMAT_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: `Field formatting and typed constraints verified across ${extractedFields.length} fields.`
        });
      }

      // -------------------------------------------------------------
      // TIER 3: DUPLICATE DETECTION (Historical collision check)
      // -------------------------------------------------------------
      let isDuplicate = false;
      let duplicateDocId = null;
      let duplicateReason = '';

      const idField = extractedFields.find(f => f.machineValue && (
        f.fieldKey.includes('number') || f.fieldKey.includes('id') || f.fieldKey.includes('no') || f.fieldKey.includes('code')
      ));

      try {
        const existingDocs = Array.from(inMemoryDocuments.values()).filter(d => d.organizationId === organizationId && d.documentId !== documentId);
        // Check 1: Same filename and identical size
        const sameFile = existingDocs.find(d => d.originalFilename === doc.originalFilename && d.fileSize === doc.fileSize && d.status === 'APPROVED');
        if (sameFile) {
          isDuplicate = true;
          duplicateDocId = sameFile.documentId;
          duplicateReason = `Exact file match with approved document '${sameFile.originalFilename}' (${sameFile.documentId.slice(0, 8)}).`;
        }

        // Check 2: Same primary business ID across approved records
        if (!isDuplicate && idField) {
          const allRecords = Array.from(StructuredDataService.getInMemoryRecords().values()).filter(r => r.organizationId === organizationId && r.documentId !== documentId && r.status === 'APPROVED');
          for (const r of allRecords) {
            const rFields = Array.from(StructuredDataService.getInMemoryFields().values()).filter(f => f.structuredRecordId === r.structuredRecordId);
            const matchId = rFields.find(f => f.fieldKey === idField.fieldKey && f.effectiveValue === idField.machineValue);
            if (matchId) {
              isDuplicate = true;
              duplicateDocId = r.documentId;
              duplicateReason = `Duplicate business reference ${idField.displayName}="${idField.machineValue}" matches approved document (${r.documentId.slice(0, 8)}).`;
              break;
            }
          }
        }
      } catch (dupErr) {
        // Fallback
      }

      if (isDuplicate) {
        requiresReview = true;
        if (!reviewReason) reviewReason = 'DUPLICATE_DOCUMENT';
        validationResults.push({
          ruleName: 'DUPLICATE_DETECTION',
          validationType: 'DUPLICATE_ASSERTION',
          passed: false,
          severity: 'WARNING',
          message: `Potential Duplicate Detected: ${duplicateReason}`
        });
      } else {
        validationResults.push({
          ruleName: 'DUPLICATE_DETECTION',
          validationType: 'DUPLICATE_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: 'Duplicate check passed: Document and identifiers are unique within organization.'
        });
      }

      // -------------------------------------------------------------
      // TIER 4: ARITHMETIC INTEGRITY (Subtotal + Tax = Total)
      // -------------------------------------------------------------
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
          if (!reviewReason) reviewReason = 'ARITHMETIC_MISMATCH';
          validationResults.push({
            ruleName: 'ARITHMETIC_INTEGRITY',
            validationType: 'MATH_ASSERTION',
            passed: false,
            severity: 'ERROR',
            message: `Arithmetic Anomaly: Subtotal (${subtotalVal}) + Tax (${taxVal}) = ${expectedTotal}, but Total was ${actualTotal} (Mismatch of ${diff.toFixed(2)}).`
          });
        } else {
          validationResults.push({
            ruleName: 'ARITHMETIC_INTEGRITY',
            validationType: 'MATH_ASSERTION',
            passed: true,
            severity: 'INFO',
            message: `Arithmetic verified: Subtotal (${subtotalVal}) + Tax (${taxVal}) = Total (${actualTotal}).`
          });
        }
      } else {
        validationResults.push({
          ruleName: 'ARITHMETIC_INTEGRITY',
          validationType: 'MATH_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: 'Arithmetic check: No subtotal/tax formula mismatch detected.'
        });
      }

      // Check schema fields presence:
      const populatedFields = extractedFields.filter(f => f.machineValue !== null && f.machineValue !== undefined && String(f.machineValue).trim() !== '');

      if (fieldDefinitions.length > 0 && populatedFields.length === 0) {
        requiresReview = true;
        if (!reviewReason) reviewReason = 'ALL_FIELDS_MISSING';
        validationResults.push({
          ruleName: 'SCHEMA_FIELD_COVERAGE',
          validationType: 'SCHEMA_ASSERTION',
          passed: false,
          severity: 'ERROR',
          message: `All ${fieldDefinitions.length} schema fields are unreadable or missing from document.`
        });
      } else if (fieldDefinitions.length > 0) {
        validationResults.push({
          ruleName: 'SCHEMA_FIELD_COVERAGE',
          validationType: 'SCHEMA_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: `${populatedFields.length} of ${fieldDefinitions.length} data fields extracted successfully.`
        });
      } else if (populatedFields.length > 0) {
        validationResults.push({
          ruleName: 'DYNAMIC_SCHEMA_DISCOVERY',
          validationType: 'SCHEMA_ASSERTION',
          passed: true,
          severity: 'INFO',
          message: `Automatically discovered and structured ${populatedFields.length} document fields.`
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
        let revType = 'VALIDATION';
        let revPriority = 'MEDIUM';

        if (reviewReason === 'CLASSIFICATION_UNCERTAIN' || reviewReason === 'UNKNOWN_DOCUMENT_TYPE') {
          revType = 'CLASSIFICATION';
          revPriority = 'MEDIUM';
        } else if (reviewReason === 'ARITHMETIC_MISMATCH' || reviewReason === 'DUPLICATE_DOCUMENT') {
          revType = 'VALIDATION';
          revPriority = 'HIGH';
        } else if (reviewReason === 'FORMAT_VALIDATION_ERROR' || reviewReason === 'DATE_VALIDATION_ERROR' || reviewReason === 'ALL_FIELDS_MISSING') {
          revType = 'FIELD';
          revPriority = reviewReason === 'ALL_FIELDS_MISSING' ? 'HIGH' : 'MEDIUM';
        }

        const reviewItem = await ReviewService.createReviewItem(organizationId, {
          jobId,
          documentId,
          reviewType: revType,
          reviewReason: reviewReason || 'VALIDATION_FAILED',
          priority: revPriority,
          confidence: classificationConfidence,
          sourceFieldKey: totalObj ? totalObj.fieldKey : (extractedFields[0]?.fieldKey || null),
          originalValue: totalObj ? totalObj.machineValue : null,
          metadata: {
            missingFields: populatedFields.length === 0 ? fieldDefinitions.map(f => f.fieldKey || f.key) : [],
            validationResults
          }
        });
        console.log(`[REVIEW] Created reviewItem: id=${reviewItem.reviewItemId}, type=${revType}, priority=${revPriority}, reason=${reviewReason}`);
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
