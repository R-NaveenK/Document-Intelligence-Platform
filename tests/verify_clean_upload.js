const fs = require('fs');
const path = require('path');
const http = require('http');

async function test() {
  const filePath = path.join(__dirname, '..', 'Docstest', 'MFG_2PDF_01_Supplier_Invoice_Clean.pdf');
  const buffer = fs.readFileSync(filePath);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  const profilePart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="profileId"\r\n\r\n5e46638f-875d-4174-9fae-dc51dfe25d26\r\n`
  );
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="MFG_2PDF_01_Supplier_Invoice_Clean.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([profilePart, header, buffer, footer]);

  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/documents/upload?profileId=5e46638f-875d-4174-9fae-dc51dfe25d26',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length,
      'x-organization-id': '00000000-0000-0000-0000-000000000001'
    }
  }, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => {
      console.log('UPLOAD STATUS:', res.statusCode, 'BODY:', b);
      setTimeout(() => {
        http.get('http://localhost:5000/api/v1/records', { headers: { 'x-organization-id': '00000000-0000-0000-0000-000000000001' } }, res2 => {
          let b2 = '';
          res2.on('data', c => b2 += c);
          res2.on('end', () => {
            const data = JSON.parse(b2);
            console.log('EXTRACTED FIELDS IN STRUCTURED DATA:');
            console.log(JSON.stringify(data.data[0]?.fields, null, 2));
          });
        });
      }, 2500);
    });
  });

  req.write(payload);
  req.end();
}

test();
