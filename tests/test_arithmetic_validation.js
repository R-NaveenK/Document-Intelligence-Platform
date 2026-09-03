/**
 * Verification Script for Arithmetic Validation Failure
 */

const http = require('http');

async function testArithmeticValidation() {
  console.log('Testing Arithmetic Validation and Review Routing...');

  // 1. Get or create Manufacturing Profile
  const profileRes = await new Promise((resolve) => {
    http.get('http://localhost:5000/api/v1/profiles', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  let profileId;
  if (profileRes.data && profileRes.data.length > 0) {
    profileId = profileRes.data[0].profileId;
  } else {
    // Deploy starter
    const dep = require('./deploy_docstest_template');
    return;
  }

  // 2. Create document with deliberate arithmetic error
  const invalidMathDoc = `[WORD_DOCX]\nPRECISION FORGE MANUFACTURING PVT. LTD.\nCOMMERCIAL TAX INVOICE\nInvoice Number: INV-ERR-MATH-001\nVendor Name: Vertex Hardware Solutions\nInvoice Date: 2026-08-30\nSubtotal: 100,000.00\nTax Amount: 18,000.00\nTotal Amount: 250,000.00\nStatus: Pending Reconciliation`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let body = [];
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="profileId"\r\n\r\n${profileId}\r\n`));
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="Arithmetic_Error_Invoice.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`));
  body.push(Buffer.from(invalidMathDoc));
  body.push(Buffer.from('\r\n'));
  body.push(Buffer.from(`--${boundary}--\r\n`));
  const finalBuffer = Buffer.concat(body);

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
      }
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(finalBuffer);
    req.end();
  });

  console.log('Uploaded Arithmetic Error Invoice. Upload Status:', uploadRes.success ? '201 Created' : uploadRes);

  console.log('Waiting 4 seconds for Multi-Engine & Validation Engine (:5003)...');
  await new Promise(r => setTimeout(r, 4000));

  // Check Documents
  const docsRes = await new Promise((resolve) => {
    http.get('http://localhost:5000/api/v1/documents', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  const mathDoc = docsRes.data.find(d => d.originalFilename === 'Arithmetic_Error_Invoice.docx');
  console.log('\n--- DOCUMENT PIPELINE RESULT ---');
  console.log(`Document: ${mathDoc?.originalFilename}`);
  console.log(`Status: ${mathDoc?.jobStatus || mathDoc?.status}`);
  console.log(`Requires Review: ${mathDoc?.jobStatus === 'NEEDS_REVIEW' || mathDoc?.status === 'NEEDS_REVIEW' ? 'YES (CORRECT)' : 'NO (ERROR)'}`);

  // Check Review Queue
  const reviewRes = await new Promise((resolve) => {
    http.get('http://localhost:5000/api/v1/reviews', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  console.log('\n--- HUMAN REVIEW QUEUE ---');
  console.log('Items in Review Queue:', reviewRes.data?.length || 0);
  (reviewRes.data || []).forEach(item => {
    console.log(`* Review ID: ${item.reviewItemId}, Reason: ${item.reviewReason}, Status: ${item.status}`);
  });
}

testArithmeticValidation().catch(console.error);
