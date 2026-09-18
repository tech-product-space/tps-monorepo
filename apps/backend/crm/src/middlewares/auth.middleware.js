const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { enforceReadOnly } = require('./readOnly.middleware');

/**
 * Middleware to authenticate requests using JWT
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Invalid token format.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'name', 'email', 'role', 'manager_id', 'is_active']
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or account is deactivated.' });
    }

    // Attach user to request object
    // Force ID to standard lowercase string to prevent case-sensitivity issues in comparisons
    const safeUser = user.toJSON();
    safeUser.id = safeUser.id.toLowerCase();
    req.user = safeUser;
    // Workspace grants travel in the JWT itself (see auth.controller's
    // generateTokens), so downstream handlers read them from the decoded
    // payload rather than re-querying admin_workspace_grants per request.
    req.tokenPayload = decoded;

    // Read-only roles are guarded here rather than per-route, so the check
    // cannot be forgotten on a new endpoint. No-op for every other role.
    return enforceReadOnly(req, res, next);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * Middleware to restrict access based on user roles
 * @param {string[]} roles - Array of allowed roles
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

module.exports = {
  authenticate,
  requireRole
};
