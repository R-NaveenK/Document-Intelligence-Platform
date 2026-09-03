/**
 * Reset and Clear All Stored Demo/Test Data
 * Resets documents, jobs, reviews, records, and export history.
 */

const http = require('http');

function apiCall(endpoint, method = 'DELETE') {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/v1${endpoint}`,
      method: method,
      headers: {
        'x-organization-id': '00000000-0000-0000-0000-000000000001',
        'Content-Type': 'application/json'
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(b) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: b });
        }
      });
    });
    req.on('error', err => resolve({ status: 'ERR', error: err.message }));
    req.end();
  });
}

async function clearPlatformData() {
  console.log('Clearing all documents, jobs, records, reviews, and export history...');

  // 1. Clear Documents & Jobs
  const docsRes = await apiCall('/documents', 'DELETE');
  console.log('[CLEAR DOCUMENTS]', docsRes.status, docsRes.data?.data?.message || docsRes.data?.message || 'Done');

  // 2. Clear Export History
  const exportsRes = await apiCall('/exports', 'DELETE');
  console.log('[CLEAR EXPORTS]', exportsRes.status, exportsRes.data?.data?.message || exportsRes.data?.message || 'Done');

  // 3. Clear Profiles (optional, let's delete existing test profiles so user starts fresh)
  const profilesRes = await new Promise(resolve => {
    http.get('http://localhost:5000/api/v1/profiles', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  if (profilesRes && profilesRes.data) {
    for (const p of profilesRes.data) {
      await apiCall(`/profiles/${p.profileId}`, 'DELETE');
      console.log(`[DELETED PROFILE] ${p.name} (${p.profileId})`);
    }
  }

  console.log('\n==================================================');
  console.log('PLATFORM FULLY RESET & READY FOR FRESH DEMO!');
  console.log('==================================================');
}

clearPlatformData();
