/**
 * Test uploading the 3 Docstest files directly to the Precision Forge template
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

async function testDocstestUpload() {
  console.log('Fetching Precision Forge profile...');
  const profilesRes = await new Promise(resolve => {
    http.get('http://localhost:5000/api/v1/profiles', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  const profile = profilesRes.data.find(p => p.name.includes('Precision Forge'));
  if (!profile) {
    console.error('Precision Forge profile not found!');
    return;
  }
  console.log(`Found Profile: ${profile.name} (ID: ${profile.profileId})`);

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let body = [];

  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="profileId"\r\n\r\n${profile.profileId}\r\n`));

  const f1Path = path.join(__dirname, '..', 'Docstest', 'Manufacturing_Test_01_Clean_Supplier_Invoice.pdf');
  const f2Path = path.join(__dirname, '..', 'Docstest', 'Manufacturing_Test_02_Blurry_Material_Receipt.png');
  const f3Path = path.join(__dirname, '..', 'Docstest', 'Manufacturing_Test_03_Production_Dispatch_Manifest.docx');

  const files = [
    { name: 'Manufacturing_Test_01_Clean_Supplier_Invoice.pdf', buf: fs.readFileSync(f1Path), mime: 'application/pdf' },
    { name: 'Manufacturing_Test_02_Blurry_Material_Receipt.png', buf: fs.readFileSync(f2Path), mime: 'image/png' },
    { name: 'Manufacturing_Test_03_Production_Dispatch_Manifest.docx', buf: fs.readFileSync(f3Path), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  ];

  files.forEach(f => {
    body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.mime}\r\n\r\n`));
    body.push(f.buf);
    body.push(Buffer.from('\r\n'));
  });

  body.push(Buffer.from(`--${boundary}--\r\n`));
  const finalBuffer = Buffer.concat(body);

  console.log(`Uploading ${files.length} demo files to API Gateway...`);
  const uploadRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/documents/upload',
      method: 'POST',
      headers: {
        'x-organization-id': '00000000-0000-0000-0000-000000000001',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': finalBuffer.length
      },
      timeout: 30000
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(b) }));
    });
    req.on('error', reject);
    req.write(finalBuffer);
    req.end();
  });

  console.log('Upload Result Status:', uploadRes.status);
  console.log('Waiting 4 seconds for Multi-Engine Extraction & Classifier to finish...');
  await new Promise(r => setTimeout(r, 4000));

  const docsRes = await new Promise(resolve => {
    http.get('http://localhost:5000/api/v1/documents', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  console.log('\n--- PROCESSED DEMO DOCUMENTS ---');
  docsRes.data.filter(d => d.originalFilename.includes('Manufacturing_Test')).forEach(d => {
    console.log(`* File: ${d.originalFilename}`);
    console.log(`  - Status: ${d.jobStatus || d.status}`);
    console.log(`  - Winner Engine: ${d.winningEngine || 'Consensus'}`);
    console.log(`  - Score: ${d.winningScore || 'N/A'}`);
  });

  const reviewsRes = await new Promise(resolve => {
    http.get('http://localhost:5000/api/v1/reviews', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  console.log('\n--- HUMAN REVIEW QUEUE ---');
  console.log(`Items in Review Queue: ${reviewsRes.data.length}`);
  reviewsRes.data.forEach(r => {
    console.log(`* Review Item: ${r.reviewId}, Reason: ${r.reason}`);
  });
}

testDocstestUpload().catch(console.error);
