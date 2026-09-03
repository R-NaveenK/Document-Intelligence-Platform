const fullText = `PRECISION FORGE MANUFACTURING PVT. LTD.
Subtotal
340,000.00
Tax Amount (GST 18%)
61,200.00
TOTAL AMOUNT
401,200.00`;

const subtotalMatch = fullText.match(/(?:Subtotal|Taxable\s*Amount|Net\s*Amount|Base\s*Amount)(?:\s*\([^)]*\))?\s*[:=-]?\s*(?:\r?\n)?\s*(?:INR|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i);
const taxMatch = fullText.match(/(?:Tax\s*Amount|VAT|GST|Tax)(?:\s*\([^)]*\))?\s*[:=-]?\s*(?:\r?\n)?\s*(?:INR|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i);
const totalMatch = fullText.match(/(?:Total\s*Amount|Grand\s*Total|Balance\s*Due|TOTAL\s*AMOUNT|(?<!sub)Total)\s*[:=-]?\s*(?:\r?\n)?\s*(?:INR|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i);

console.log('Subtotal:', subtotalMatch ? subtotalMatch[1] : null);
console.log('Tax:', taxMatch ? taxMatch[1] : null);
console.log('Total:', totalMatch ? totalMatch[1] : null);
