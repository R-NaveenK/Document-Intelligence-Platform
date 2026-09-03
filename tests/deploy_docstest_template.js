/**
 * Deploy Docstest Manufacturing Template directly to live platform
 */

const http = require('http');

function apiCall(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/v1${path}`,
      method: method,
      headers: {
        'x-organization-id': '00000000-0000-0000-0000-000000000001',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(b);
          resolve(parsed.data || parsed);
        } catch (e) {
          resolve(b);
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function deploy() {
  console.log('Deploying Precision Forge Manufacturing Operations template...');

  // 1. Create Profile
  const profile = await apiCall('/profiles', 'POST', {
    name: 'Precision Forge Manufacturing Operations',
    description: 'Multi-format processing for supplier invoices, material inspection receipts, and dispatch manifests'
  });
  console.log('Profile created:', profile.profileId);

  // 2. DocType 1: Supplier Invoice (.pdf)
  const dt1 = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', {
    name: 'Commercial Supplier Invoice',
    key: 'supplier_invoice',
    description: 'B2B commercial tax invoices and supplier bills',
    aliases: ['Commercial Tax Invoice', 'Supplier Invoice', 'Vendor Invoice']
  });
  const fields1 = [
    { displayName: 'Invoice Number', fieldKey: 'invoice_number', dataType: 'string', required: true },
    { displayName: 'Vendor Name', fieldKey: 'vendor_name', dataType: 'string', required: true },
    { displayName: 'Invoice Date', fieldKey: 'invoice_date', dataType: 'date', required: true },
    { displayName: 'Subtotal', fieldKey: 'subtotal', dataType: 'decimal', required: false },
    { displayName: 'Tax Amount', fieldKey: 'tax_amount', dataType: 'decimal', required: false },
    { displayName: 'Total Amount', fieldKey: 'total_amount', dataType: 'decimal', required: true },
    { displayName: 'Purchase Order', fieldKey: 'purchase_order', dataType: 'string', required: false }
  ];
  for (const f of fields1) await apiCall(`/document-types/${dt1.documentTypeId}/fields`, 'POST', f);

  // 3. DocType 2: Material Receipt (.png)
  const dt2 = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', {
    name: 'Material Receipt & Inspection Slip',
    key: 'material_receipt',
    description: 'Material receipt notes and goods inspection slips',
    aliases: ['Material Receipt', 'Inspection Slip', 'MRN', 'Material Receipt & Inspection Slip']
  });
  const fields2 = [
    { displayName: 'Receipt Number', fieldKey: 'receipt_number', dataType: 'string', required: true },
    { displayName: 'Supplier Name', fieldKey: 'supplier_name', dataType: 'string', required: true },
    { displayName: 'Receipt Date', fieldKey: 'receipt_date', dataType: 'date', required: true },
    { displayName: 'Total Amount', fieldKey: 'total_amount', dataType: 'decimal', required: true },
    { displayName: 'Material Description', fieldKey: 'material_description', dataType: 'string', required: false },
    { displayName: 'Inspection Status', fieldKey: 'inspection_status', dataType: 'string', required: false }
  ];
  for (const f of fields2) await apiCall(`/document-types/${dt2.documentTypeId}/fields`, 'POST', f);

  // 4. DocType 3: Dispatch Manifest (.docx)
  const dt3 = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', {
    name: 'Production Dispatch Manifest',
    key: 'dispatch_manifest',
    description: 'Production dispatch and delivery shipping manifests',
    aliases: ['Dispatch Manifest', 'Shipping Manifest', 'Production & Dispatch Manifest']
  });
  const fields3 = [
    { displayName: 'Manifest Number', fieldKey: 'manifest_number', dataType: 'string', required: true },
    { displayName: 'Tracking Number', fieldKey: 'tracking_number', dataType: 'string', required: true },
    { displayName: 'Dispatch Date', fieldKey: 'dispatch_date', dataType: 'date', required: true },
    { displayName: 'Recipient Name', fieldKey: 'recipient_name', dataType: 'string', required: true },
    { displayName: 'Sender Name', fieldKey: 'sender_name', dataType: 'string', required: false },
    { displayName: 'Total Weight', fieldKey: 'total_weight', dataType: 'string', required: false }
  ];
  for (const f of fields3) await apiCall(`/document-types/${dt3.documentTypeId}/fields`, 'POST', f);

  // 5. Publish Schema v1
  const pub = await apiCall(`/profiles/${profile.profileId}/schema/publish`, 'POST', {
    changeSummary: 'Initial Precision Forge Manufacturing Schema v1.0.0'
  });

  console.log('Schema published successfully! Version:', pub.schemaVersion);
  console.log('SUCCESS: Docstest Demo Template is deployed and ready for upload!');
}

deploy().catch(console.error);
