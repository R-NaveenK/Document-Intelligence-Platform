const http = require('http');

async function testUpload() {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  let body = [];

  const profileRes = await new Promise(resolve => {
    http.get('http://localhost:5000/api/v1/profiles', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  const profileId = profileRes.data[0]?.profileId;
  console.log('Using profileId:', profileId);

  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="profileId"\r\n\r\n${profileId}\r\n`));

  const docText = `%PDF-1.4\nHOSPITAL PATIENT INVOICE\nPatient Name: Naveen Kumar R\nInvoice Date: 2026-09-03\nTotal Amount: $25,000.00\n%%EOF`;
  body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test_invoice.pdf"\r\nContent-Type: application/pdf\r\n\r\n`));
  body.push(Buffer.from(docText));
  body.push(Buffer.from('\r\n'));

  body.push(Buffer.from(`--${boundary}--\r\n`));
  const finalBuffer = Buffer.concat(body);

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
    let b = ''; res.on('data', c => b += c); res.on('end', () => console.log('UPLOAD RES:', res.statusCode, b));
  });

  req.write(finalBuffer);
  req.end();
}

testUpload();
