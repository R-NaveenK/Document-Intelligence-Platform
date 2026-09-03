/**
 * Health Check Verification Script
 * Checks health of all core services and infrastructure dependencies.
 */

const http = require('http');

function checkEndpoint(name, urlStr) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.get(urlStr, { timeout: 3000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[PASS] ${name} (${urlStr}) is UP [Status: ${res.statusCode}]`);
            resolve({ name, status: 'UP', statusCode: res.statusCode });
          } else {
            console.error(`[FAIL] ${name} (${urlStr}) returned status ${res.statusCode}`);
            resolve({ name, status: 'DOWN', statusCode: res.statusCode });
          }
        });
      });
      req.on('error', (err) => {
        console.error(`[FAIL] ${name} (${urlStr}) Error: ${err.message}`);
        resolve({ name, status: 'DOWN', error: err.message });
      });
      req.on('timeout', () => {
        req.destroy();
        console.error(`[FAIL] ${name} (${urlStr}) Timeout`);
        resolve({ name, status: 'DOWN', error: 'Timeout' });
      });
    } catch (e) {
      console.error(`[FAIL] ${name} (${urlStr}) Invalid URL: ${e.message}`);
      resolve({ name, status: 'DOWN', error: e.message });
    }
  });
}

async function runHealthCheckSuite() {
  console.log('==================================================');
  console.log('Running Service Health Verification Suite');
  console.log('==================================================\n');

  const services = [
    { name: 'Express Backend API Gateway Health', url: 'http://localhost:5000/api/v1/health' },
    { name: 'Extraction Mock Service', url: 'http://localhost:5001/health' },
    { name: 'COR Extraction Engine 2 Service', url: 'http://localhost:5005/health' },
    { name: 'Classifier FastAPI Service', url: 'http://localhost:8000/health' },
    { name: 'Structuring Mock Service', url: 'http://localhost:5002/health' },
    { name: 'Real Validation Engine Service', url: 'http://localhost:5003/health' },
    { name: 'Extraction Engine 3 Service', url: 'http://localhost:5004/health' }
  ];

  const results = await Promise.all(services.map(s => checkEndpoint(s.name, s.url)));
  const failed = results.filter(r => r.status !== 'UP');

  console.log('\n==================================================');
  if (failed.length === 0) {
    console.log('ALL SERVICES ARE UP AND HEALTHY!');
  } else {
    console.log(`HEALTH CHECK COMPLETED WITH ${failed.length} OFFLINE SERVICE(S).`);
    console.log('(Note: Services may not be running locally yet unless started via npm start / docker-compose)');
  }
  console.log('==================================================');
}

if (require.main === module) {
  runHealthCheckSuite();
}

module.exports = { runHealthCheckSuite };
