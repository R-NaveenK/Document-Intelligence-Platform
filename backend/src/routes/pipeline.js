const express = require('express');
const router = express.Router();
const { processPipeline } = require('../services/orchestrator');

/**
 * Trigger E2E pipeline processing (Extraction -> Classifier -> Structuring -> Validation)
 */
router.post('/process', async (req, res, next) => {
  try {
    const { jobId, fileId } = req.body || {};
    const result = await processPipeline(jobId || `job_${Date.now()}`, fileId || `file_${Date.now()}`);
    
    if (result.finalStatus === 'FAILED') {
      return res.status(500).json(result);
    }
    
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
