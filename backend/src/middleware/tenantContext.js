/**
 * Tenant Context Middleware
 * Extracts organization and tenant context from request headers, user token, or defaults.
 */
function extractTenantContext(req, res, next) {
  const organizationId = req.headers['x-organization-id'] || 
                         req.headers['x-tenant-id'] || 
                         (req.user && req.user.organizationId) || 
                         '00000000-0000-0000-0000-000000000001';

  if (!organizationId) {
    return res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Organization ID is required' } });
  }

  req.organizationId = organizationId;
  req.tenant = {
    organizationId,
    tenantId: organizationId
  };

  next();
}

module.exports = {
  extractTenantContext,
  tenantMiddleware: extractTenantContext
};
