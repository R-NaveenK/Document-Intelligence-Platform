const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB buffer limit
});

const IngestionService = require('../services/ingestionService');
const { successResponse, errorResponse } = require('../utils/response');

// POST /api/v1/documents/upload - Upload single or multiple documents (Max 20 files per batch)
router.post('/documents/upload', upload.any(), async (req, res) => {
  try {
    const orgId = req.organizationId;
    const profileId = req.body.profileId;
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;

    if (!profileId) {
      return errorResponse(res, 'MISSING_PROFILE_ID', 'Processing profile ID is required for upload');
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) {
      return errorResponse(res, 'NO_FILES_PROVIDED', 'At least one file must be provided');
    }

    const result = await IngestionService.ingestFiles(orgId, profileId, files, idempotencyKey);
    return successResponse(res, result, 201);
  } catch (err) {
    return errorResponse(res, err.code || 'INGESTION_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/documents - List documents with filters
router.get('/documents', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const documents = await IngestionService.listDocuments(orgId, req.query || {});
    return successResponse(res, documents);
  } catch (err) {
    return errorResponse(res, err.code || 'LIST_DOCUMENTS_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/documents/:documentId - Get document detail
router.get('/documents/:documentId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const doc = await IngestionService.getDocumentById(orgId, req.params.documentId);
    return successResponse(res, doc);
  } catch (err) {
    return errorResponse(res, err.code || 'GET_DOCUMENT_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 400);
  }
});

// GET /api/v1/documents/:documentId/extraction-comparison - Get extraction comparison scorecard & engine breakdown
router.get('/documents/:documentId/extraction-comparison', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const comparison = await IngestionService.getExtractionComparison(orgId, req.params.documentId);
    return successResponse(res, comparison);
  } catch (err) {
    return errorResponse(res, err.code || 'EXTRACTION_COMPARISON_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 400);
  }
});

// GET /api/v1/jobs/:jobId - Get job status
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const job = await IngestionService.getJobById(orgId, req.params.jobId);
    return successResponse(res, job);
  } catch (err) {
    return errorResponse(res, err.code || 'GET_JOB_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 400);
  }
});

// POST /api/v1/jobs/:jobId/retry - Retry failed job
router.post('/jobs/:jobId/retry', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await IngestionService.retryJob(orgId, req.params.jobId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'RETRY_JOB_ERROR', err.message || err.toString());
  }
});

// DELETE /api/v1/documents/:documentId - Delete single document
router.delete('/documents/:documentId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await IngestionService.deleteDocument(orgId, req.params.documentId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'DELETE_DOCUMENT_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 500);
  }
});

// DELETE /api/v1/documents - Clear all ingested documents
router.delete('/documents', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await IngestionService.clearAllDocuments(orgId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'DELETE_DOCUMENTS_ERROR', err.message || err.toString());
  }
});

module.exports = router;
