const text = `PRECISION FORGE MANUFACTURING PVT. LTD.
Industrial Manufacturing Division - Coimbatore, Tamil Nadu
COMMERCIAL SUPPLIER INVOICE
Invoice Number
MFG-INV-2026-9201
Invoice Date
2026-08-27
Vendor Name
Omega Machine Tools Pvt. Ltd.
Purchase Order
PO-89521
Tax Amount
36,000.00
Total Amount
236,000.00
Description
Qty
Unit Price
Amount
Industrial Bearing Assembly
25
6,000.00
150,000.00
Sealed Roller Bearings
20
2,500.00
50,000.00
Subtotal
200,000.00
Tax Amount (18%)
36,000.00
TOTAL AMOUNT
236,000.00
Synthetic IDP test document.`;

function extractField(key, text) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('(?:^|\\b)' + escaped + '\\s*[:=-]\\s*([^\\r\\n]+)', 'i'),
    new RegExp('(?:^|\\b)' + escaped + '\\s*[:=-]?\\s*\\r?\\n\\s*([^\\r\\n]+)', 'i')
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].trim()) {
      return m[1].trim();
    }
  }
  return null;
}

console.log('Invoice Number:', extractField('Invoice Number', text));
console.log('Vendor Name:', extractField('Vendor Name', text));
console.log('Invoice Date:', extractField('Invoice Date', text));
console.log('Purchase Order:', extractField('Purchase Order', text));
console.log('Subtotal:', extractField('Subtotal', text));
console.log('Tax Amount:', extractField('Tax Amount', text));
console.log('Total Amount:', extractField('TOTAL AMOUNT', text));
