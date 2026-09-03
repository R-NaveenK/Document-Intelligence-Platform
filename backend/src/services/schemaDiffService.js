/**
 * Schema Change Analyzer for Living Schema (Stage 9)
 * Compares two schema versions to compute fieldsAdded, fieldsChanged, and fieldsDisabled.
 */

class SchemaDiffService {

  static diffSchemas(oldSchema = {}, newSchema = {}) {
    const oldDocTypes = oldSchema.documentTypes || [];
    const newDocTypes = newSchema.documentTypes || [];

    const fieldsAdded = [];
    const fieldsChanged = [];
    const fieldsDisabled = [];

    const oldFieldsMap = new Map();
    oldDocTypes.forEach(dt => {
      (dt.fields || []).forEach(f => {
        oldFieldsMap.set(`${dt.documentTypeId}:${f.fieldKey}`, f);
      });
    });

    const newFieldsMap = new Map();
    newDocTypes.forEach(dt => {
      (dt.fields || []).forEach(f => {
        const key = `${dt.documentTypeId}:${f.fieldKey}`;
        newFieldsMap.set(key, f);

        if (!oldFieldsMap.has(key)) {
          fieldsAdded.push({
            documentTypeId: dt.documentTypeId,
            fieldKey: f.fieldKey,
            displayName: f.displayName,
            dataType: f.dataType || 'string'
          });
        } else {
          const oldF = oldFieldsMap.get(key);
          if (oldF.dataType !== f.dataType || oldF.required !== f.required) {
            fieldsChanged.push({
              documentTypeId: dt.documentTypeId,
              fieldKey: f.fieldKey,
              oldDataType: oldF.dataType,
              newDataType: f.dataType
            });
          }
        }
      });
    });

    oldFieldsMap.forEach((oldF, key) => {
      if (!newFieldsMap.has(key)) {
        fieldsDisabled.push({
          documentTypeId: oldF.documentTypeId,
          fieldKey: oldF.fieldKey
        });
      }
    });

    return {
      fieldsAdded,
      fieldsChanged,
      fieldsDisabled
    };
  }
}

module.exports = SchemaDiffService;
