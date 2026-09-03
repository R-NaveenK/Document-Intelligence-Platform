const express = require('express');
const router = express.Router();
const StructuredDataService = require('../services/structuredDataService');
const SearchService = require('../services/searchService');
const { extractTenantContext } = require('../middleware/tenantContext');

router.use(extractTenantContext);

// Browse structured records
router.get('/records', async (req, res) => {
  try {
    const data = await StructuredDataService.listRecords(req.tenant.organizationId, req.query);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Get record details
router.get('/records/:recordId', async (req, res) => {
  try {
    const detail = await StructuredDataService.getRecordById(req.tenant.organizationId, req.params.recordId);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(err.status || (err.code === 'NOT_FOUND' ? 404 : 500)).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Full-text search
router.get('/search', async (req, res) => {
  try {
    const data = await SearchService.fullTextSearch(req.tenant.organizationId, req.query);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Dynamic multi-filter search query
router.post('/search/query', async (req, res) => {
  try {
    const data = await SearchService.querySearch(req.tenant.organizationId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'INVALID_QUERY', message: err.message }
    });
  }
});

module.exports = router;
