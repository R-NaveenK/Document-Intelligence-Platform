const express = require('express');
const router = express.Router();
const http = require('http');
const { checkDbHealth } = require('../services/db');
const { checkRedisHealth } = require('../services/redis');

function checkHttpServiceHealth(urlStr) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.get(`${url.origin}/health`, { timeout: 2000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: 'UP', details: JSON.parse(body) });
            } catch (e) {
              resolve({ status: 'UP', raw: body });
            }
          } else {
            resolve({ status: 'DOWN', statusCode: res.statusCode });
          }
        });
      });
      req.on('error', (err) => resolve({ status: 'DOWN', error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 'DOWN', error: 'Timeout' });
      });
    } catch (err) {
      resolve({ status: 'DOWN', error: err.message });
    }
  });
}

router.get('/health', async (req, res) => {
  const extractionUrl = process.env.EXTRACTION_SERVICE_URL || 'http://localhost:5001';
  const classifierUrl = process.env.CLASSIFIER_SERVICE_URL || 'http://localhost:8000';
  const structuringUrl = process.env.STRUCTURING_SERVICE_URL || 'http://localhost:5002';
  const validationUrl = process.env.VALIDATION_SERVICE_URL || 'http://localhost:5003';
  const extractionEngine3Url = process.env.EXTRACTION_ENGINE_3_URL || 'http://localhost:5004';

  const [dbHealth, redisHealth, extractionHealth, classifierHealth, structuringHealth, validationHealth, engine3Health] = await Promise.all([
    checkDbHealth(),
    checkRedisHealth(),
    checkHttpServiceHealth(extractionUrl),
    checkHttpServiceHealth(classifierUrl),
    checkHttpServiceHealth(structuringUrl),
    checkHttpServiceHealth(validationUrl),
    checkHttpServiceHealth(extractionEngine3Url)
  ]);

  const overallUp = dbHealth.status === 'UP' && 
                    redisHealth.status === 'UP' && 
                    extractionHealth.status === 'UP' && 
                    classifierHealth.status === 'UP' && 
                    structuringHealth.status === 'UP' && 
                    validationHealth.status === 'UP' &&
                    engine3Health.status === 'UP';

  res.status(overallUp ? 200 : 207).json({
    status: overallUp ? 'HEALTHY' : 'PARTIAL',
    timestamp: new Date().toISOString(),
    services: {
      backendGateway: { status: 'UP' },
      postgres: dbHealth,
      redis: redisHealth,
      extractionMock: extractionHealth,
      classifierService: classifierHealth,
      structuringMock: structuringHealth,
      validationMock: validationHealth,
      extractionEngine3: engine3Health
    }
  });
});

module.exports = router;
