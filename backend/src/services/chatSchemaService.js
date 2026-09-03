const ProfileService = require('./profileService');

class ChatSchemaService {

  // Retrieve compact schema metadata for an organization
  static async getSchemaContext(organizationId, profileId = null, documentTypeId = null) {
    const profiles = await ProfileService.listProfiles(organizationId);
    const contextProfiles = [];

    for (const p of profiles) {
      if (profileId && p.profileId !== profileId) continue;

      const schema = await ProfileService.getProfileSchema(organizationId, p.profileId).catch(() => null);
      if (!schema) continue;

      const docTypes = (schema.documentTypes || []).map(dt => {
        if (documentTypeId && dt.documentTypeId !== documentTypeId) return null;
        return {
          documentTypeId: dt.documentTypeId,
          name: dt.name,
          key: dt.key,
          description: dt.description || '',
          aliases: dt.aliases || [],
          fields: (dt.fields || []).map(f => ({
            fieldId: f.fieldId,
            fieldKey: f.fieldKey,
            displayName: f.displayName,
            dataType: f.dataType || 'string',
            required: f.required || false,
            aliases: f.aliases || []
          }))
        };
      }).filter(Boolean);

      if (docTypes.length > 0) {
        contextProfiles.push({
          profileId: p.profileId,
          name: p.name,
          documentTypes: docTypes
        });
      }
    }

    return contextProfiles;
  }

  // List flat fields across all document types
  static async listOrganizationFields(organizationId) {
    const context = await this.getSchemaContext(organizationId);
    const fields = [];
    for (const p of context) {
      for (const dt of p.documentTypes) {
        for (const f of dt.fields) {
          fields.push({
            fieldKey: f.fieldKey,
            displayName: f.displayName,
            dataType: f.dataType,
            documentType: dt.name,
            profile: p.name
          });
        }
      }
    }
    return fields;
  }

  // Resolve user wording / aliases to exact schema fieldKey
  static async resolveFieldKey(organizationId, fieldWording, profileId = null, documentTypeId = null) {
    if (!fieldWording || typeof fieldWording !== 'string') return null;

    const term = fieldWording.trim().toLowerCase();
    const schemaContext = await this.getSchemaContext(organizationId, profileId, documentTypeId);

    const exactMatches = [];
    const aliasMatches = [];

    for (const p of schemaContext) {
      for (const dt of p.documentTypes) {
        for (const f of dt.fields) {
          const normKey = f.fieldKey.toLowerCase();
          const normName = f.displayName.toLowerCase();
          const normAliases = (f.aliases || []).map(a => a.toLowerCase());

          if (normKey === term || normName === term || term.includes(normKey) || term.includes(normName)) {
            exactMatches.push({ fieldKey: f.fieldKey, displayName: f.displayName, dataType: f.dataType });
          } else if (normAliases.includes(term) || normKey.includes(term) || normName.includes(term)) {
            aliasMatches.push({ fieldKey: f.fieldKey, displayName: f.displayName, dataType: f.dataType });
          }
        }
      }
    }

    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) {
      return { isAmbiguous: true, candidates: exactMatches };
    }

    if (aliasMatches.length === 1) return aliasMatches[0];
    if (aliasMatches.length > 1) {
      return { isAmbiguous: true, candidates: aliasMatches };
    }

    return null;
  }
}

module.exports = ChatSchemaService;
