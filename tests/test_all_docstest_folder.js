const fs = require('fs');
const path = require('path');
const http = require('http');

async function run() {
  console.log('='*70);
  console.log('RUNNING FULL AUTOMATED PIPELINE TEST ON DOCSTEST FOLDER');
  console.log('='*70);

  // 1. Reset and Deploy Template
  require('./clear_all_data.js');
  await new Promise(r => setTimeout(r, 1000));
  require('./deploy_docstest_template.js');
  await new Promise(r => setTimeout(r, 2000));

  // 2. Fetch Profile ID
  const profilesRes = await makeGet('/api/v1/profiles');
  const profileId = profilesRes.data[0].profileId;
  console.log('Using Profile ID:', profileId);

  // 3. Upload all files from Docstest
  const docsDir = path.join(__dirname, '..', 'Docstest');
  const fileNames = fs.readdirSync(docsDir);

  console.log(`\nUploading ${fileNames.length} files from Docstest...`);

  for (const f of fileNames) {
    const filePath = path.join(docsDir, f);
    const buffer = fs.readFileSync(filePath);
    const mime = f.endsWith('.pdf') ? 'application/pdf' : f.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'image/png';
    await uploadFile(f, buffer, mime, profileId);
    console.log(`[UPLOADED] ${f}`);
  }

  // Wait for async extraction and validation pipeline to finish
  console.log('\nWaiting for pipeline consensus and validation...');
  await new Promise(r => setTimeout(r, 6000));

  // 4. Inspect Ingested Documents
  const docs = await makeGet('/api/v1/documents');
  console.log(`\n[DOCUMENTS INGESTED]: ${docs.data.length} total`);
  docs.data.forEach(d => {
    console.log(` - ${d.originalFilename.padEnd(55)} | Status: ${(d.jobStatus || d.status).padEnd(14)} | Winner: ${d.winningEngine || 'Multi-Engine'}`);
  });

  // 5. Inspect Human Review Queue
  const reviews = await makeGet('/api/v1/reviews');
  console.log(`\n[HUMAN REVIEW QUEUE]: ${reviews.data.length} pending review(s)`);
  reviews.data.forEach(r => {
    console.log(` - Review ID: ${r.reviewItemId} | File: ${r.document?.originalFilename} | Reason: ${r.reviewReason}`);
  });

  // 6. Inspect Structured Data Records
  const records = await makeGet('/api/v1/records');
  console.log(`\n[STRUCTURED DATA RECORDS]: ${records.data.results.length} approved records`);
  records.data.results.forEach((rec, i) => {
    console.log(`\n--- Record #${i+1}: ${rec.filename} ---`);
    console.log(JSON.stringify(rec.fields, null, 2));
  });

  console.log('\n==================================================');
  console.log('DOCSTEST BATCH PROCESSING COMPLETE!');
  console.log('==================================================');
}

function makeGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:5000${path}`, { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { resolve(b); }
      });
    }).on('error', reject);
  });
}

function uploadFile(filename, buffer, mimeType, profileId) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const profilePart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="profileId"\r\n\r\n${profileId}\r\n`);
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const payload = Buffer.concat([profilePart, header, buffer, footer]);

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/documents/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        'x-organization-id': '00000000-0000-0000-0000-000000000001'
      }
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(b));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

run();
