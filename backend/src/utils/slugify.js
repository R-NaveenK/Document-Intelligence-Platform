/**
 * Helper to convert strings into safe snake_case keys
 * Example: "Fee Receipt" -> "fee_receipt", "Patient Name!" -> "patient_name"
 */
function toSnakeCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

module.exports = {
  toSnakeCase
};
