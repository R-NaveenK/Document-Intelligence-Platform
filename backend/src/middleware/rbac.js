/**
 * Role-Based Access Control (RBAC) Middleware Placeholder
 */
function rbacMiddleware(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = req.user ? req.user.role : 'USER';
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    next();
  };
}

module.exports = rbacMiddleware;
