/**
 * Utility to validate payloads against contract rules
 */

function validateExtractionOutput(data) {
  if (!data || typeof data !== 'object') throw new Error('Extraction payload must be an object');
  if (!data.jobId || typeof data.jobId !== 'string') throw new Error('Extraction missing jobId');
  if (!data.fileId || typeof data.fileId !== 'string') throw new Error('Extraction missing fileId');
  if (!Array.isArray(data.pages)) throw new Error('Extraction pages must be an array');
  
  for (const page of data.pages) {
    if (typeof page.pageNumber !== 'number') throw new Error('Page missing pageNumber');
    if (typeof page.text !== 'string') throw new Error('Page missing text string');
    if (typeof page.ocrConfidence !== 'number') throw new Error('Page missing ocrConfidence');
  }
  return true;
}

function validateClassifierOutput(data) {
  if (!data || typeof data !== 'object') throw new Error('Classifier payload must be an object');
  if (!data.jobId || typeof data.jobId !== 'string') throw new Error('Classifier missing jobId');
  if (!data.fileId || typeof data.fileId !== 'string') throw new Error('Classifier missing fileId');
  if (!Array.isArray(data.pageGroups)) throw new Error('Classifier pageGroups must be an array');
  
  for (const group of data.pageGroups) {
    if (!group.logicalDocumentId) throw new Error('Page group missing logicalDocumentId');
    if (!Array.isArray(group.pages)) throw new Error('Page group missing pages array');
    if (typeof group.classificationConfidence !== 'number') throw new Error('Page group missing classificationConfidence');
    if (typeof group.requiresReview !== 'boolean') throw new Error('Page group missing requiresReview flag');
  }
  return true;
}

function validateStructuringOutput(data) {
  if (!data || typeof data !== 'object') throw new Error('Structuring payload must be an object');
  if (!data.logicalDocumentId) throw new Error('Structuring output missing logicalDocumentId');
  if (!Array.isArray(data.fields)) throw new Error('Structuring fields must be an array');
  
  for (const field of data.fields) {
    if (!field.fieldKey) throw new Error('Field missing fieldKey');
    if (field.value === undefined) throw new Error('Field missing value');
    if (typeof field.confidence !== 'number') throw new Error('Field missing confidence');
  }
  return true;
}

function validateValidationOutput(data) {
  if (!data || typeof data !== 'object') throw new Error('Validation payload must be an object');
  if (!data.logicalDocumentId) throw new Error('Validation output missing logicalDocumentId');
  if (!data.status) throw new Error('Validation output missing status');
  if (!Array.isArray(data.validationResults)) throw new Error('Validation output missing validationResults array');
  if (typeof data.requiresReview !== 'boolean') throw new Error('Validation output missing requiresReview flag');
  
  for (const res of data.validationResults) {
    if (!res.type) throw new Error('Validation item missing type');
    if (!res.fieldKey) throw new Error('Validation item missing fieldKey');
    if (typeof res.passed !== 'boolean') throw new Error('Validation item missing passed boolean');
  }
  return true;
}

module.exports = {
  validateExtractionOutput,
  validateClassifierOutput,
  validateStructuringOutput,
  validateValidationOutput
};
