/**
 * Query Builder Security & Operator Validator for Stage 6
 * Enforces typed operator allowlists and prevents SQL Injection attacks.
 */

const ALLOWED_OPERATORS_BY_TYPE = Object.freeze({
  string: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  integer: ['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal', 'between'],
  decimal: ['equals', 'not_equals', 'greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal', 'between'],
  date: ['equals', 'before', 'after', 'between'],
  datetime: ['equals', 'before', 'after', 'between'],
  boolean: ['equals']
});

class QueryBuilder {

  static validateFilter(filter, fieldDefinition) {
    const { fieldKey, operator, value, valueMin, valueMax } = filter;

    // 1. Check for SQL Injection patterns in fieldKey
    if (!fieldKey || typeof fieldKey !== 'string' || /[^a-zA-Z0-9_-]/.test(fieldKey)) {
      throw { code: 'INVALID_FIELD_KEY', message: `Field key '${fieldKey}' contains invalid characters or SQL injection attempt.` };
    }

    let dataType = fieldDefinition ? fieldDefinition.dataType : null;

    if (!dataType) {
      if (fieldKey === 'createdAt' || fieldKey === 'updatedAt') {
        dataType = 'date';
      } else {
        // Lookup stored field definition data type dynamically
        const StructuredDataService = require('./structuredDataService');
        const allFields = Array.from(StructuredDataService.getInMemoryFields().values());
        const matchedField = allFields.find(f => f.fieldKey === fieldKey);
        dataType = matchedField ? matchedField.dataType : 'string';
      }
    }

    dataType = dataType.toLowerCase();
    const allowed = ALLOWED_OPERATORS_BY_TYPE[dataType] || ALLOWED_OPERATORS_BY_TYPE.string;

    // 2. Validate Operator Allowlist
    if (!allowed.includes(operator)) {
      throw {
        code: 'UNSUPPORTED_OPERATOR',
        message: `Operator '${operator}' is not supported for data type '${dataType}'. Allowed operators: ${allowed.join(', ')}`
      };
    }

    return {
      fieldKey,
      dataType,
      operator,
      value,
      valueMin,
      valueMax
    };
  }

  // Evaluate typed filter condition in memory / SQL parameterizer
  static evaluateFieldFilter(fieldRecord, filter) {
    if (!fieldRecord) {
      return filter.operator === 'is_empty';
    }

    const { operator, value, valueMin, valueMax, dataType } = filter;
    const effVal = fieldRecord.effectiveValue;

    switch (operator) {
      case 'is_empty':
        return effVal === null || effVal === undefined || effVal === '';
      case 'is_not_empty':
        return effVal !== null && effVal !== undefined && effVal !== '';
      case 'equals':
        if (dataType === 'boolean') {
          return fieldRecord.valueBoolean === (String(value).toLowerCase() === 'true');
        }
        if (dataType === 'integer' || dataType === 'decimal') {
          const num = dataType === 'integer' ? fieldRecord.valueInteger : fieldRecord.valueDecimal;
          return num === Number(value);
        }
        return String(effVal || '').toLowerCase() === String(value || '').toLowerCase();
      case 'not_equals':
        return String(effVal || '').toLowerCase() !== String(value || '').toLowerCase();
      case 'contains':
        return String(effVal || '').toLowerCase().includes(String(value || '').toLowerCase());
      case 'starts_with':
        return String(effVal || '').toLowerCase().startsWith(String(value || '').toLowerCase());
      case 'ends_with':
        return String(effVal || '').toLowerCase().endsWith(String(value || '').toLowerCase());
      case 'greater_than':
        if (dataType === 'integer') return (fieldRecord.valueInteger || 0) > Number(value);
        if (dataType === 'decimal') return (fieldRecord.valueDecimal || 0) > Number(value);
        return false;
      case 'greater_than_or_equal':
        if (dataType === 'integer') return (fieldRecord.valueInteger || 0) >= Number(value);
        if (dataType === 'decimal') return (fieldRecord.valueDecimal || 0) >= Number(value);
        return false;
      case 'less_than':
        if (dataType === 'integer') return (fieldRecord.valueInteger || 0) < Number(value);
        if (dataType === 'decimal') return (fieldRecord.valueDecimal || 0) < Number(value);
        return false;
      case 'less_than_or_equal':
        if (dataType === 'integer') return (fieldRecord.valueInteger || 0) <= Number(value);
        if (dataType === 'decimal') return (fieldRecord.valueDecimal || 0) <= Number(value);
        return false;
      case 'between':
        if (dataType === 'integer') {
          const vInt = fieldRecord.valueInteger || 0;
          return vInt >= Number(valueMin || value) && vInt <= Number(valueMax || value);
        }
        if (dataType === 'decimal') {
          const vDec = fieldRecord.valueDecimal || 0;
          return vDec >= Number(valueMin || value) && vDec <= Number(valueMax || value);
        }
        if (dataType === 'date' || dataType === 'datetime') {
          const dStr = fieldRecord.valueDate || fieldRecord.valueText || '';
          return dStr >= String(valueMin || value) && dStr <= String(valueMax || value);
        }
        return false;
      case 'before':
        const dBefore = fieldRecord.valueDate || fieldRecord.valueText || '';
        return dBefore < String(value);
      case 'after':
        const dAfter = fieldRecord.valueDate || fieldRecord.valueText || '';
        return dAfter > String(value);
      default:
        return false;
    }
  }
}

module.exports = QueryBuilder;
