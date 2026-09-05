const express = require('express');
const router = express.Router();
const ReprocessingService = require('../services/reprocessingService');
const { extractTenantContext } = require('../middleware/tenantContext');

router.use(extractTenantContext);

// Preview Reprocessing Eligibility
router.post('/reprocessing/preview', async (req, res) => {
  try {
    const preview = await ReprocessingService.previewReprocessing(req.tenant.organizationId, req.body);
    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'PREVIEW_ERROR', message: err.message }
    });
  }
});

// Create & Start Reprocessing Job
router.post(['/reprocessing/jobs', '/reprocessing/trigger', '/living-schema/reprocess'], async (req, res) => {
  try {
    const job = await ReprocessingService.createReprocessingJob(req.tenant.organizationId, req.body);
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'REPROCESSING_ERROR', message: err.message }
    });
  }
});

// List Reprocessing Jobs History
router.get('/reprocessing/jobs', async (req, res) => {
  try {
    const jobs = await ReprocessingService.listReprocessingJobs(req.tenant.organizationId);
    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Get Reprocessing Job Details
router.get('/reprocessing/jobs/:jobId', async (req, res) => {
  try {
    const job = await ReprocessingService.getReprocessingJob(req.tenant.organizationId, req.params.jobId);
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(err.status || (err.code === 'NOT_FOUND' ? 404 : 500)).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Get Record Enrichment History
router.get('/records/:recordId/enrichment-history', async (req, res) => {
  try {
    const history = await ReprocessingService.getEnrichmentHistory(req.tenant.organizationId, req.params.recordId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

module.exports = router;
