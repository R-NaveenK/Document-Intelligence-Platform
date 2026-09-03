const express = require('express');
const router = express.Router();
const ProfileService = require('../services/profileService');
const { successResponse, errorResponse } = require('../utils/response');

// GET /api/v1/profiles - List all profiles for tenant
router.get('/profiles', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const profiles = await ProfileService.listProfiles(orgId);
    return successResponse(res, profiles);
  } catch (err) {
    return errorResponse(res, err.code || 'LIST_PROFILES_ERROR', err.message || err.toString());
  }
});

// POST /api/v1/profiles - Create profile
router.post('/profiles', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const profile = await ProfileService.createProfile(orgId, req.body || {});
    return successResponse(res, profile, 201);
  } catch (err) {
    return errorResponse(res, err.code || 'CREATE_PROFILE_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/profiles/:profileId - Get profile details
router.get('/profiles/:profileId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const profile = await ProfileService.getProfileById(orgId, req.params.profileId);
    return successResponse(res, profile);
  } catch (err) {
    return errorResponse(res, err.code || 'GET_PROFILE_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 400);
  }
});

// PUT /api/v1/profiles/:profileId - Edit profile
router.put('/profiles/:profileId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const profile = await ProfileService.updateProfile(orgId, req.params.profileId, req.body || {});
    return successResponse(res, profile);
  } catch (err) {
    return errorResponse(res, err.code || 'UPDATE_PROFILE_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/profiles/:profileId/schema - Get complete schema
router.get('/profiles/:profileId/schema', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const schema = await ProfileService.getProfileSchema(orgId, req.params.profileId);
    return successResponse(res, schema);
  } catch (err) {
    return errorResponse(res, err.code || 'GET_SCHEMA_ERROR', err.message || err.toString());
  }
});

// POST /api/v1/profiles/:profileId/schema/publish - Publish schema
router.post(['/profiles/:profileId/schema/publish', '/profiles/:profileId/publish'], async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await ProfileService.publishSchema(orgId, req.params.profileId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'PUBLISH_SCHEMA_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/profiles/:profileId/document-types - List document types
router.get('/profiles/:profileId/document-types', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const docTypes = await ProfileService.listDocumentTypes(orgId, req.params.profileId);
    return successResponse(res, docTypes);
  } catch (err) {
    return errorResponse(res, err.code || 'LIST_DOC_TYPES_ERROR', err.message || err.toString());
  }
});

// POST /api/v1/profiles/:profileId/document-types - Add document type
router.post('/profiles/:profileId/document-types', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const docType = await ProfileService.addDocumentType(orgId, req.params.profileId, req.body || {});
    return successResponse(res, docType, 201);
  } catch (err) {
    return errorResponse(res, err.code || 'ADD_DOC_TYPE_ERROR', err.message || err.toString());
  }
});

// PUT /api/v1/document-types/:documentTypeId - Update document type
router.put('/document-types/:documentTypeId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const docType = await ProfileService.updateDocumentType(orgId, req.params.documentTypeId, req.body || {});
    return successResponse(res, docType);
  } catch (err) {
    return errorResponse(res, err.code || 'UPDATE_DOC_TYPE_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/document-types/:documentTypeId/fields - List fields for document type
router.get(['/document-types/:documentTypeId/fields', '/profiles/:profileId/document-types/:documentTypeId/fields'], async (req, res) => {
  try {
    const orgId = req.organizationId;
    const fields = await ProfileService.listFields(orgId, req.params.documentTypeId);
    return successResponse(res, fields);
  } catch (err) {
    return errorResponse(res, err.code || 'LIST_FIELDS_ERROR', err.message || err.toString());
  }
});

// POST /api/v1/document-types/:documentTypeId/fields - Add custom field
router.post(['/document-types/:documentTypeId/fields', '/profiles/:profileId/document-types/:documentTypeId/fields'], async (req, res) => {
  try {
    const orgId = req.organizationId;
    const field = await ProfileService.addField(orgId, req.params.documentTypeId, req.body || {});
    return successResponse(res, field, 201);
  } catch (err) {
    return errorResponse(res, err.code || 'ADD_FIELD_ERROR', err.message || err.toString());
  }
});

// PUT /api/v1/fields/:fieldId - Update custom field
router.put('/fields/:fieldId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const field = await ProfileService.updateField(orgId, req.params.fieldId, req.body || {});
    return successResponse(res, field);
  } catch (err) {
    return errorResponse(res, err.code || 'UPDATE_FIELD_ERROR', err.message || err.toString());
  }
});

// PATCH /api/v1/fields/:fieldId/status - Enable / Disable custom field
router.patch('/fields/:fieldId/status', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const { active } = req.body || {};
    const field = await ProfileService.toggleFieldStatus(orgId, req.params.fieldId, active);
    return successResponse(res, field);
  } catch (err) {
    return errorResponse(res, err.code || 'TOGGLE_FIELD_STATUS_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/profiles/:profileId/classifier-config - Generate Classifier Config
router.get('/profiles/:profileId/classifier-config', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const config = await ProfileService.getClassifierConfig(orgId, req.params.profileId);
    return successResponse(res, config);
  } catch (err) {
    return errorResponse(res, err.code || 'GET_CLASSIFIER_CONFIG_ERROR', err.message || err.toString());
  }
});

// GET /api/v1/profiles/:profileId/document-types/:documentTypeId/structuring-schema - Generate Structuring Schema
router.get('/profiles/:profileId/document-types/:documentTypeId/structuring-schema', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const schema = await ProfileService.getStructuringSchema(orgId, req.params.profileId, req.params.documentTypeId);
    return successResponse(res, schema);
  } catch (err) {
    return errorResponse(res, err.code || 'GET_STRUCTURING_SCHEMA_ERROR', err.message || err.toString());
  }
});

// DELETE /api/v1/profiles - Clear all profiles for tenant
router.delete('/profiles', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await ProfileService.clearAllProfiles(orgId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'DELETE_PROFILES_ERROR', err.message || err.toString());
  }
});

// DELETE /api/v1/profiles/:profileId - Delete profile
router.delete('/profiles/:profileId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await ProfileService.deleteProfile(orgId, req.params.profileId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'DELETE_PROFILE_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 500);
  }
});

// DELETE /api/v1/profiles/:profileId/document-types/:documentTypeId - Delete document type
router.delete('/profiles/:profileId/document-types/:documentTypeId', async (req, res) => {
  try {
    const orgId = req.organizationId;
    const result = await ProfileService.deleteDocumentType(orgId, req.params.profileId, req.params.documentTypeId);
    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, err.code || 'DELETE_DOC_TYPE_ERROR', err.message || err.toString(), err.code === 'NOT_FOUND' ? 404 : 500);
  }
});

module.exports = router;
