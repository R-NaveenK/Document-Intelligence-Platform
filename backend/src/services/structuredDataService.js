const { v4: uuidv4 } = require('uuid');
const ProfileService = require('./profileService');
const IngestionService = require('./ingestionService');

// In-Memory stores for standalone & local dev execution
const inMemoryStructuredRecords = new Map();
const inMemoryRecordFields = new Map();
const inMemoryValidationResults = [];

class StructuredDataService {

  // Centralized Effective Value & Typed Value Calculation
  static calculateEffectiveValue(machineValue, humanValue, dataType = 'string') {
    const effective = (humanValue !== null && humanValue !== undefined) ? humanValue : machineValue;
    const typed = {
      valueText: effective !== null && effective !== undefined ? String(effective) : null,
      valueInteger: null,
      valueDecimal: null,
      valueDate: null,
      valueDatetime: null,
      valueBoolean: null
    };

    if (effective !== null && effective !== undefined && effective !== '') {
      const strVal = String(effective).trim();
      switch (dataType.toLowerCase()) {
        case 'integer':
          const parsedInt = parseInt(strVal, 10);
          typed.valueInteger = !isNaN(parsedInt) ? parsedInt : null;
          break;
        case 'decimal':
          const parsedDec = parseFloat(strVal.replace(/[^0-9.-]+/g, ""));
          typed.valueDecimal = !isNaN(parsedDec) ? parsedDec : null;
          break;
        case 'date':
          typed.valueDate = strVal;
          break;
        case 'datetime':
          typed.valueDatetime = strVal;
          break;
        case 'boolean':
          typed.valueBoolean = ['true', '1', 'yes'].includes(strVal.toLowerCase());
          break;
      }
    }

    return {
      machineValue,
      humanValue: humanValue || null,
      effectiveValue: effective,
      ...typed
    };
  }

  // Create & Persist Structured Record
  static async createStructuredRecord(organizationId, payload) {
    const {
      structuredRecordId: existingRecordId,
      documentId,
      logicalDocumentId,
      profileId,
      documentTypeId,
      schemaVersionId,
      processingJobId,
      fields = [],
      validationResults = [],
      status = 'APPROVED'
    } = payload;

    const structuredRecordId = existingRecordId || uuidv4();
    const doc = await IngestionService.getDocumentById(organizationId, documentId).catch(() => null);

    const record = {
      structuredRecordId,
      organizationId,
      documentId,
      logicalDocumentId,
      profileId,
      documentTypeId,
      schemaVersionId,
      processingJobId,
      status,
      filename: doc ? doc.originalFilename : 'document.pdf',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemoryStructuredRecords.set(structuredRecordId, record);

    // Save field values
    const savedFields = [];
    for (const f of fields) {
      const fieldValueId = uuidv4();
      const rawVal = f.machineValue !== undefined && f.machineValue !== null ? f.machineValue : (f.effectiveValue !== undefined ? f.effectiveValue : f.value);
      const valCalc = this.calculateEffectiveValue(rawVal, f.humanValue, f.dataType || 'string');

      const fieldRecord = {
        fieldValueId,
        organizationId,
        structuredRecordId,
        fieldDefinitionId: f.fieldDefinitionId || null,
        fieldKey: f.fieldKey,
        displayName: f.displayName || f.fieldKey,
        dataType: f.dataType || 'string',
        machineValue: valCalc.machineValue,
        humanValue: valCalc.humanValue,
        effectiveValue: valCalc.effectiveValue,
        valueText: valCalc.valueText,
        valueInteger: valCalc.valueInteger,
        valueDecimal: valCalc.valueDecimal,
        valueDate: valCalc.valueDate,
        valueDatetime: valCalc.valueDatetime,
        valueBoolean: valCalc.valueBoolean,
        confidence: f.confidence || 0.95,
        pageNumber: f.pageNumber || 1,
        sourceText: f.sourceText || null,
        boundingBox: f.boundingBox || null,
        reviewed: valCalc.humanValue !== null,
        createdAt: new Date().toISOString()
      };

      inMemoryRecordFields.set(`${structuredRecordId}:${f.fieldKey}`, fieldRecord);
      savedFields.push(fieldRecord);
    }

    // Save validation results
    for (const v of validationResults) {
      const valRecord = {
        validationResultId: uuidv4(),
        structuredRecordId,
        fieldKey: v.fieldKey || null,
        validationType: v.validationType || 'FORMAT',
        passed: v.passed !== false,
        message: v.message || 'Validation passed',
        validatedValueSnapshot: v.snapshot || null,
        createdAt: new Date().toISOString()
      };
      inMemoryValidationResults.push(valRecord);
    }

    ProfileService.recordAudit(organizationId, null, 'STRUCTURED_RECORD_CREATED', 'STRUCTURED_RECORD', structuredRecordId, {
      documentTypeId,
      fieldCount: fields.length
    });

    return {
      ...record,
      structuredRecordId,
      record,
      fields: savedFields
    };
  }

  // Get Structured Record Detail
  static async getRecordById(organizationId, structuredRecordId) {
    const record = inMemoryStructuredRecords.get(structuredRecordId);
    if (!record || record.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Structured record not found' };
    }

    const fields = Array.from(inMemoryRecordFields.values())
      .filter(f => f.structuredRecordId === structuredRecordId);

    const valResults = inMemoryValidationResults
      .filter(v => v.structuredRecordId === structuredRecordId);

    const doc = await IngestionService.getDocumentById(organizationId, record.documentId).catch(() => null);

    return {
      ...record,
      documentFilename: doc ? doc.originalFilename : record.filename,
      fields,
      validationResults: valResults
    };
  }

  // List Structured Records
  static async listRecords(organizationId, filters = {}) {
    let records = Array.from(inMemoryStructuredRecords.values())
      .filter(r => r.organizationId === organizationId);

    if (filters.profileId) records = records.filter(r => r.profileId === filters.profileId);
    if (filters.documentTypeId) records = records.filter(r => r.documentTypeId === filters.documentTypeId);
    
    // Default to APPROVED records unless status is explicitly provided
    const targetStatus = filters.status || 'APPROVED';
    if (targetStatus !== 'ALL') {
      records = records.filter(r => r.status === targetStatus);
    }

    const page = parseInt(filters.page || 1, 10);
    const limit = Math.min(parseInt(filters.limit || 20, 10), 100);
    const total = records.length;
    const startIndex = (page - 1) * limit;

    const paginated = records.slice(startIndex, startIndex + limit).map(r => {
      const fieldsMap = {};
      Array.from(inMemoryRecordFields.values())
        .filter(f => f.structuredRecordId === r.structuredRecordId)
        .forEach(f => {
          fieldsMap[f.fieldKey] = f.effectiveValue;
        });

      return {
        ...r,
        fields: fieldsMap
      };
    });

    return {
      results: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Helper for tests / search engine
  static getInMemoryRecords() {
    return inMemoryStructuredRecords;
  }

  static getInMemoryFields() {
    return inMemoryRecordFields;
  }

  static clearAllRecords(organizationId) {
    let count = 0;
    for (const [id, r] of inMemoryStructuredRecords.entries()) {
      if (r.organizationId === organizationId) {
        inMemoryStructuredRecords.delete(id);
        count++;
      }
    }
    for (const [id, f] of inMemoryRecordFields.entries()) {
      inMemoryRecordFields.delete(id);
    }
    return count;
  }
}

module.exports = StructuredDataService;
