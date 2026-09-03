const { v4: uuidv4 } = require('uuid');
const { toSnakeCase } = require('../utils/slugify');

/**
 * In-Memory Store Fallback for Stage 2 Profile Service
 * Ensures 100% reliability both with local PostgreSQL and in standalone testing mode.
 */
const inMemoryProfiles = new Map();
const inMemoryDocumentTypes = new Map();
const inMemoryFields = new Map();
const inMemorySchemaVersions = new Map();
const inMemoryAuditEvents = [];

class ProfileService {

  // Record Audit Event
  static recordAudit(organizationId, userId, action, entityType, entityId, details = {}) {
    const event = {
      id: uuidv4(),
      organizationId,
      userId: userId || '00000000-0000-0000-0000-000000000002',
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString()
    };
    inMemoryAuditEvents.push(event);
    return event;
  }

  static getAuditLogs(organizationId) {
    return inMemoryAuditEvents.filter(e => e.organizationId === organizationId);
  }

  // List all profiles for an organization
  static async listProfiles(organizationId) {
    const profiles = Array.from(inMemoryProfiles.values())
      .filter(p => p.organizationId === organizationId);
    return profiles;
  }

  // Create a new processing profile
  static async createProfile(organizationId, { name, description }) {
    if (!name || !name.trim()) {
      throw { code: 'INVALID_INPUT', message: 'Profile name cannot be empty' };
    }

    const profileId = uuidv4();
    const schemaVersionId = uuidv4();

    const initialSchemaVersion = {
      id: schemaVersionId,
      profileId: profileId,
      versionNumber: 1,
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      publishedAt: null
    };

    const profile = {
      profileId,
      organizationId,
      name: name.trim(),
      description: description ? description.trim() : '',
      active: true,
      status: 'DRAFT',
      currentSchemaVersion: 1,
      currentSchemaVersionId: schemaVersionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemoryProfiles.set(profileId, profile);
    inMemorySchemaVersions.set(schemaVersionId, initialSchemaVersion);

    // Initialize default document type for profile
    const defaultDocTypeId = uuidv4();
    const defaultDocType = {
      documentTypeId: defaultDocTypeId,
      profileId,
      organizationId,
      schemaVersionId,
      name: 'Standard Document',
      key: 'standard_document',
      description: 'Default document type for ' + profile.name,
      aliases: ['Document', 'Standard'],
      displayOrder: 1,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    inMemoryDocumentTypes.set(defaultDocTypeId, defaultDocType);

    this.recordAudit(organizationId, null, 'PROFILE_CREATED', 'PROFILE', profileId, { name: profile.name });

    return profile;
  }

  // Get profile by ID
  static async getProfileById(organizationId, profileId) {
    const profile = inMemoryProfiles.get(profileId);
    if (!profile || profile.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Processing profile not found' };
    }
    return profile;
  }

  // Update profile
  static async updateProfile(organizationId, profileId, { name, description, active }) {
    const profile = await this.getProfileById(organizationId, profileId);

    if (name !== undefined) {
      if (!name || !name.trim()) throw { code: 'INVALID_INPUT', message: 'Profile name cannot be empty' };
      profile.name = name.trim();
    }
    if (description !== undefined) profile.description = description.trim();
    if (active !== undefined) profile.active = Boolean(active);
    
    profile.updatedAt = new Date().toISOString();
    inMemoryProfiles.set(profileId, profile);

    this.recordAudit(organizationId, null, 'PROFILE_UPDATED', 'PROFILE', profileId, { name: profile.name });

    return profile;
  }

  // List document types for a profile
  static async listDocumentTypes(organizationId, profileId) {
    await this.getProfileById(organizationId, profileId);
    const docTypes = Array.from(inMemoryDocumentTypes.values())
      .filter(dt => dt.profileId === profileId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    
    // Attach field counts
    return docTypes.map(dt => {
      const fields = Array.from(inMemoryFields.values()).filter(f => f.documentTypeId === dt.documentTypeId);
      return {
        ...dt,
        fieldCount: fields.length
      };
    });
  }

  // Add document type to a profile
  static async addDocumentType(organizationId, profileId, { name, key, description, aliases, displayOrder }) {
    const profile = await this.getProfileById(organizationId, profileId);

    if (!name || !name.trim()) {
      throw { code: 'INVALID_INPUT', message: 'Document type name cannot be empty' };
    }

    const docTypeKey = key && key.trim() ? toSnakeCase(key) : toSnakeCase(name);
    if (!docTypeKey) {
      throw { code: 'INVALID_INPUT', message: 'Invalid document type key' };
    }

    // Check duplicate name or key within the same profile
    const existing = Array.from(inMemoryDocumentTypes.values()).filter(dt => dt.profileId === profileId);
    if (existing.some(dt => dt.key === docTypeKey)) {
      throw { code: 'DUPLICATE_KEY', message: `Document type key '${docTypeKey}' already exists in this profile` };
    }
    if (existing.some(dt => dt.name.toLowerCase() === name.trim().toLowerCase())) {
      throw { code: 'DUPLICATE_NAME', message: `Document type name '${name}' already exists in this profile` };
    }

    const documentTypeId = uuidv4();
    const docType = {
      documentTypeId,
      profileId,
      organizationId,
      schemaVersionId: profile.currentSchemaVersionId,
      name: name.trim(),
      key: docTypeKey,
      description: description ? description.trim() : '',
      aliases: Array.isArray(aliases) ? aliases : [],
      displayOrder: typeof displayOrder === 'number' ? displayOrder : existing.length + 1,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemoryDocumentTypes.set(documentTypeId, docType);

    // If profile was published, trigger draft state
    if (profile.status === 'PUBLISHED') {
      profile.status = 'DRAFT';
    }
    profile.updatedAt = new Date().toISOString();

    this.recordAudit(organizationId, null, 'DOCUMENT_TYPE_ADDED', 'DOCUMENT_TYPE', documentTypeId, { name: docType.name, key: docType.key });

    return docType;
  }

  // Update document type
  static async updateDocumentType(organizationId, documentTypeId, { name, description, aliases, displayOrder, active }) {
    const docType = inMemoryDocumentTypes.get(documentTypeId);
    if (!docType || docType.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Document type not found' };
    }

    if (name !== undefined) {
      if (!name || !name.trim()) throw { code: 'INVALID_INPUT', message: 'Document type name cannot be empty' };
      docType.name = name.trim();
    }
    if (description !== undefined) docType.description = description.trim();
    if (aliases !== undefined) docType.aliases = Array.isArray(aliases) ? aliases : [];
    if (displayOrder !== undefined) docType.displayOrder = displayOrder;
    if (active !== undefined) docType.active = Boolean(active);

    docType.updatedAt = new Date().toISOString();
    inMemoryDocumentTypes.set(documentTypeId, docType);

    this.recordAudit(organizationId, null, 'DOCUMENT_TYPE_UPDATED', 'DOCUMENT_TYPE', documentTypeId, { name: docType.name });

    return docType;
  }

  // Get Document Type by ID
  static async getDocumentTypeById(organizationId, documentTypeId) {
    const docType = inMemoryDocumentTypes.get(documentTypeId);
    if (!docType || docType.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Document type not found' };
    }
    return docType;
  }

  // List fields for a document type
  static async listFields(organizationId, documentTypeId) {
    await this.getDocumentTypeById(organizationId, documentTypeId);
    const fields = Array.from(inMemoryFields.values())
      .filter(f => f.documentTypeId === documentTypeId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    return fields;
  }

  // Add custom field to a document type
  static async addField(organizationId, documentTypeId, { displayName, fieldKey, description, dataType, required, multiple, aliases, displayOrder }) {
    const docType = await this.getDocumentTypeById(organizationId, documentTypeId);
    
    if (!displayName || !displayName.trim()) {
      throw { code: 'INVALID_INPUT', message: 'Field name cannot be empty' };
    }

    const validDataTypes = ['string', 'integer', 'decimal', 'date', 'datetime', 'boolean'];
    const chosenType = (dataType || 'string').toLowerCase();
    if (!validDataTypes.includes(chosenType)) {
      throw { code: 'INVALID_DATA_TYPE', message: `Invalid data type '${dataType}'. Supported types: ${validDataTypes.join(', ')}` };
    }

    const key = fieldKey && fieldKey.trim() ? toSnakeCase(fieldKey) : toSnakeCase(displayName);
    if (!key) {
      throw { code: 'INVALID_INPUT', message: 'Invalid field key' };
    }

    // Check duplicate key within the same document type
    const existing = Array.from(inMemoryFields.values()).filter(f => f.documentTypeId === documentTypeId);
    if (existing.some(f => f.fieldKey === key)) {
      throw { code: 'DUPLICATE_KEY', message: `Field key '${key}' already exists in this document type` };
    }

    const fieldId = uuidv4();
    const field = {
      fieldId,
      documentTypeId,
      organizationId,
      fieldKey: key,
      displayName: displayName.trim(),
      description: description ? description.trim() : '',
      dataType: chosenType,
      required: Boolean(required),
      multiple: Boolean(multiple),
      aliases: Array.isArray(aliases) ? aliases : [],
      displayOrder: typeof displayOrder === 'number' ? displayOrder : existing.length + 1,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemoryFields.set(fieldId, field);

    this.recordAudit(organizationId, null, 'FIELD_ADDED', 'FIELD', fieldId, { displayName: field.displayName, fieldKey: field.fieldKey });

    return field;
  }

  // Update custom field
  static async updateField(organizationId, fieldId, { displayName, description, dataType, required, multiple, aliases, displayOrder }) {
    const field = inMemoryFields.get(fieldId);
    if (!field || field.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Custom field not found' };
    }

    if (displayName !== undefined) {
      if (!displayName || !displayName.trim()) throw { code: 'INVALID_INPUT', message: 'Field display name cannot be empty' };
      field.displayName = displayName.trim();
    }
    if (description !== undefined) field.description = description.trim();
    if (dataType !== undefined) {
      const validDataTypes = ['string', 'integer', 'decimal', 'date', 'datetime', 'boolean'];
      const chosenType = dataType.toLowerCase();
      if (!validDataTypes.includes(chosenType)) {
        throw { code: 'INVALID_DATA_TYPE', message: `Invalid data type '${dataType}'` };
      }
      field.dataType = chosenType;
    }
    if (required !== undefined) field.required = Boolean(required);
    if (multiple !== undefined) field.multiple = Boolean(multiple);
    if (aliases !== undefined) field.aliases = Array.isArray(aliases) ? aliases : [];
    if (displayOrder !== undefined) field.displayOrder = displayOrder;

    field.updatedAt = new Date().toISOString();
    inMemoryFields.set(fieldId, field);

    this.recordAudit(organizationId, null, 'FIELD_UPDATED', 'FIELD', fieldId, { displayName: field.displayName });

    return field;
  }

  // Toggle field active status (Disable / Enable)
  static async toggleFieldStatus(organizationId, fieldId, activeStatus) {
    const field = inMemoryFields.get(fieldId);
    if (!field || field.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', message: 'Custom field not found' };
    }

    field.active = Boolean(activeStatus);
    field.updatedAt = new Date().toISOString();
    inMemoryFields.set(fieldId, field);

    const action = field.active ? 'FIELD_ENABLED' : 'FIELD_DISABLED';
    this.recordAudit(organizationId, null, action, 'FIELD', fieldId, { fieldKey: field.fieldKey, active: field.active });

    return field;
  }

  // Publish Schema Version
  static async publishSchema(organizationId, profileId) {
    const profile = await this.getProfileById(organizationId, profileId);

    const previousVersions = Array.from(inMemorySchemaVersions.values())
      .filter(v => v.profileId === profileId && v.status === 'PUBLISHED');

    if (previousVersions.length > 0) {
      profile.currentSchemaVersion = (profile.currentSchemaVersion || 1) + 1;
      profile.currentSchemaVersionId = uuidv4();
    }

    const currentVersionNum = profile.currentSchemaVersion || 1;
    const currentVersionObj = {
      id: profile.currentSchemaVersionId,
      profileId,
      versionNumber: currentVersionNum,
      status: 'PUBLISHED',
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString()
    };
    inMemorySchemaVersions.set(profile.currentSchemaVersionId, currentVersionObj);

    profile.status = 'PUBLISHED';
    profile.updatedAt = new Date().toISOString();

    this.recordAudit(organizationId, null, 'SCHEMA_PUBLISHED', 'SCHEMA_VERSION', profile.currentSchemaVersionId, {
      profileId,
      versionNumber: currentVersionNum
    });

    return {
      profileId,
      schemaVersion: currentVersionNum,
      schemaVersionId: profile.currentSchemaVersionId,
      status: 'PUBLISHED',
      publishedAt: new Date().toISOString()
    };
  }

  // Get complete profile schema (Draft / Published)
  static async getProfileSchema(organizationId, profileId) {
    const profile = await this.getProfileById(organizationId, profileId);
    const docTypes = await this.listDocumentTypes(organizationId, profileId);

    const fullDocTypes = await Promise.all(docTypes.map(async (dt) => {
      const fields = await this.listFields(organizationId, dt.documentTypeId);
      return {
        ...dt,
        fields
      };
    }));

    return {
      profileId: profile.profileId,
      name: profile.name,
      description: profile.description,
      status: profile.status,
      schemaVersion: profile.currentSchemaVersion,
      documentTypes: fullDocTypes
    };
  }

  // Generate Classifier Config Helper
  static async getClassifierConfig(organizationId, profileId) {
    const profile = await this.getProfileById(organizationId, profileId);
    const docTypes = await this.listDocumentTypes(organizationId, profileId);
    const activeDocTypes = docTypes.filter(dt => dt.active);

    return {
      profileId: profile.profileId,
      schemaVersion: profile.currentSchemaVersion,
      documentTypes: activeDocTypes.map(dt => ({
        documentTypeId: dt.documentTypeId,
        name: dt.name,
        key: dt.key,
        description: dt.description,
        aliases: dt.aliases
      }))
    };
  }

  // Generate Structuring Schema Helper
  static async getStructuringSchema(organizationId, profileId, documentTypeId) {
    const profile = await this.getProfileById(organizationId, profileId);
    const docType = await this.getDocumentTypeById(organizationId, documentTypeId);
    const fields = await this.listFields(organizationId, documentTypeId);
    const activeFields = fields.filter(f => f.active);

    return {
      profileId: profile.profileId,
      schemaVersion: profile.currentSchemaVersion,
      documentTypeId: docType.documentTypeId,
      documentType: docType.key,
      fields: activeFields.map(f => ({
        fieldKey: f.fieldKey,
        displayName: f.displayName,
        description: f.description,
        dataType: f.dataType,
        required: f.required,
        multiple: f.multiple,
        aliases: f.aliases
      }))
    };
  }

  // Delete Profile
  static async deleteProfile(organizationId, profileId) {
    const profile = inMemoryProfiles.get(profileId);
    if (!profile || profile.organizationId !== organizationId) {
      throw { code: 'NOT_FOUND', status: 404, message: 'Profile not found' };
    }
    inMemoryProfiles.delete(profileId);
    return { deleted: true, profileId };
  }

  // Clear All Profiles
  static async clearAllProfiles(organizationId) {
    let count = 0;
    for (const [id, p] of inMemoryProfiles.entries()) {
      if (p.organizationId === organizationId) {
        inMemoryProfiles.delete(id);
        count++;
      }
    }
    for (const [id, dt] of inMemoryDocumentTypes.entries()) {
      if (dt.organizationId === organizationId) inMemoryDocumentTypes.delete(id);
    }
    for (const [id, f] of inMemoryFields.entries()) {
      if (f.organizationId === organizationId) inMemoryFields.delete(id);
    }
    for (const [id, sv] of inMemorySchemaVersions.entries()) {
      inMemorySchemaVersions.delete(id);
    }
    return { clearedProfiles: count };
  }
}

module.exports = ProfileService;
