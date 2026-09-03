const express = require('express');
const router = express.Router();
const ReportingService = require('../services/reportingService');
const { extractTenantContext } = require('../middleware/tenantContext');

router.use(extractTenantContext);

// Get summary report metrics
router.get('/reports/summary', async (req, res) => {
  try {
    const report = await ReportingService.getSummaryReport(req.tenant.organizationId, req.query);
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

module.exports = router;
