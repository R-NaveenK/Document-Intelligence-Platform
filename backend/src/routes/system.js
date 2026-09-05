const express = require('express');
const router = express.Router();
const IngestionService = require('../services/ingestionService');
const StructuredDataService = require('../services/structuredDataService');
const ReviewService = require('../services/reviewService');
const { pool } = require('../services/db');

// POST /api/v1/system/clear-all
router.post('/system/clear-all', async (req, res, next) => {
  try {
    const orgId = req.organizationId || 'default-org';
    
    // Clear In-Memory Stores
    IngestionService.clearAll();
    StructuredDataService.clearAll();
    ReviewService.clearAll();

    // Clear DB if available
    try {
      await pool.query(`
        TRUNCATE TABLE 
          audit_events, 
          validation_results, 
          record_fields, 
          structured_records, 
          review_items, 
          documents, 
          processing_jobs 
        CASCADE;
      `);
    } catch (dbErr) {
      // Ignored if tables not initialized in local memory mode
    }

    res.json({
      success: true,
      message: 'All ingested documents, processing jobs, structured data records, and review exceptions have been cleared successfully.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/system/reset
router.post('/system/reset', async (req, res, next) => {
  try {
    IngestionService.clearAll();
    StructuredDataService.clearAll();
    ReviewService.clearAll();

    res.json({
      success: true,
      message: 'Platform state has been reset to clean demo environment.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
