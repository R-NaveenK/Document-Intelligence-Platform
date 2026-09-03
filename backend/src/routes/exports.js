const express = require('express');
const router = express.Router();
const ExportService = require('../services/exportService');
const { extractTenantContext } = require('../middleware/tenantContext');

router.use(extractTenantContext);

// Create Export Job
router.post('/exports', async (req, res) => {
  try {
    const job = await ExportService.createExportJob(req.tenant.organizationId, req.body);
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'EXPORT_ERROR', message: err.message }
    });
  }
});

// List Export History
router.get('/exports', async (req, res) => {
  try {
    const exports = await ExportService.listExportHistory(req.tenant.organizationId);
    res.json({ success: true, data: exports });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Get Export Job Details
router.get('/exports/:exportJobId', async (req, res) => {
  try {
    const job = await ExportService.getExportJob(req.tenant.organizationId, req.params.exportJobId);
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(err.status || (err.code === 'NOT_FOUND' ? 404 : 500)).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Download Export File
router.get('/exports/:exportJobId/download', async (req, res) => {
  try {
    const { job, buffer } = await ExportService.downloadExportFile(req.tenant.organizationId, req.params.exportJobId);
    
    let contentType = 'application/octet-stream';
    const fmt = (job.format || '').toUpperCase();
    if (fmt === 'CSV') contentType = 'text/csv; charset=utf-8';
    else if (fmt === 'EXCEL' || fmt === 'XLSX') contentType = 'application/vnd.ms-excel; charset=utf-8';
    else if (fmt === 'JSON') contentType = 'application/json; charset=utf-8';
    else if (fmt === 'PDF') contentType = 'application/pdf';
    else if (fmt === 'WORD' || fmt === 'DOCX') contentType = 'application/msword; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'DOWNLOAD_ERROR', message: err.message }
    });
  }
});

// Delete Individual Export Job
router.delete('/exports/:exportJobId', async (req, res) => {
  try {
    const result = await ExportService.deleteExportJob(req.tenant.organizationId, req.params.exportJobId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'DELETE_ERROR', message: err.message }
    });
  }
});

// Clear All Exports
router.delete('/exports', async (req, res) => {
  try {
    const result = await ExportService.clearAllExports(req.tenant.organizationId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'DELETE_ERROR', message: err.message }
    });
  }
});

module.exports = router;
