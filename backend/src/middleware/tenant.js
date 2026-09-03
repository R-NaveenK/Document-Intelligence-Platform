/**
 * Organization Isolation Middleware Placeholder
 * Ensures every incoming operation is scoped to the tenant organization.
 */
function tenantMiddleware(req, res, next) {
  const organizationId = req.headers['x-organization-id'] || (req.user && req.user.organizationId) || '00000000-0000-0000-0000-000000000001';

  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID is required' });
  }

  req.organizationId = organizationId;
  next();
}

module.exports = tenantMiddleware;
