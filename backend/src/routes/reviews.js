const express = require('express');
const router = express.Router();
const ReviewService = require('../services/reviewService');
const { extractTenantContext } = require('../middleware/tenantContext');

router.use(extractTenantContext);

// List reviews
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await ReviewService.listReviews(req.tenant.organizationId, req.query);
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Get review details
router.get('/reviews/:reviewItemId', async (req, res) => {
  try {
    const detail = await ReviewService.getReviewById(req.tenant.organizationId, req.params.reviewItemId);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(err.status || (err.code === 'NOT_FOUND' ? 404 : 500)).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Assign reviewer
router.patch('/reviews/:reviewItemId/assign', async (req, res) => {
  try {
    const updated = await ReviewService.assignReviewer(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body.assignedTo,
      req.body.rowVersion
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Start review
router.post('/reviews/:reviewItemId/start', async (req, res) => {
  try {
    const item = await ReviewService.startReview(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body.rowVersion
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Classification correction
router.post('/reviews/:reviewItemId/classification-correction', async (req, res) => {
  try {
    const item = await ReviewService.correctClassification(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message }
    });
  }
});

// Grouping correction
router.post('/reviews/:reviewItemId/grouping-correction', async (req, res) => {
  try {
    const item = await ReviewService.correctGrouping(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message }
    });
  }
});

// Field value correction
router.post('/reviews/:reviewItemId/field-correction', async (req, res) => {
  try {
    const result = await ReviewService.correctField(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message }
    });
  }
});

// Quick fix (1-click arithmetic / format resolution)
router.post('/reviews/:reviewItemId/quick-fix', async (req, res) => {
  try {
    const result = await ReviewService.applyQuickFix(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'QUICK_FIX_ERROR', message: err.message }
    });
  }
});

// Revalidate review
router.post('/reviews/:reviewItemId/revalidate', async (req, res) => {
  try {
    const result = await ReviewService.revalidateReview(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'REVALIDATION_FAILED', message: err.message }
    });
  }
});

// Override validation (confirm source value or keep duplicate)
router.post('/reviews/:reviewItemId/override', async (req, res) => {
  try {
    const item = await ReviewService.overrideValidation(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'OVERRIDE_FAILED', message: err.message }
    });
  }
});

// Save review draft
router.post('/reviews/:reviewItemId/draft', async (req, res) => {
  try {
    const item = await ReviewService.saveDraft(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'DRAFT_FAILED', message: err.message }
    });
  }
});

// Resolve / Approve review
router.post('/reviews/:reviewItemId/resolve', async (req, res) => {
  try {
    const item = await ReviewService.resolveReview(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'RESOLVE_FAILED', message: err.message }
    });
  }
});

// Reject review
router.post('/reviews/:reviewItemId/reject', async (req, res) => {
  try {
    const item = await ReviewService.rejectReview(
      req.tenant.organizationId,
      req.params.reviewItemId,
      req.body
    );
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'REJECT_FAILED', message: err.message }
    });
  }
});

module.exports = router;

