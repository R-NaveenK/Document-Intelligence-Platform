/**
 * Authentication Middleware Placeholder
 * Validates request headers/tokens and attaches current user to context.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  // Dev placeholder authentication logic
  req.user = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'admin@acme.com',
    fullName: 'Acme Admin',
    role: 'ADMIN',
    organizationId: '00000000-0000-0000-0000-000000000001'
  };

  next();
}

module.exports = authMiddleware;
