/**
 * Authentication Middleware
 * Handles token validation and user authentication
 */

const config = require('../config/environment');
const logger = require('../config/logger');

/**
 * Verify user token
 */
const checkUserAuth = (req, res, next) => {
  try {
    const token = req.headers['x-user-token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    // TODO: Implement proper JWT verification
    // For now, just pass the token
    req.user = {
      token,
      profile_id: null,
      role: 'user',
    };

    logger.debug('User authenticated', { role: req.user.role });
    next();
  } catch (err) {
    logger.error('Auth error:', err);
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
};

/**
 * Verify admin token
 */
const checkAdminAuth = (req, res, next) => {
  try {
    const token = req.headers['x-admin-token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No admin token provided',
      });
    }

    // TODO: Implement proper JWT verification
    req.admin = {
      token,
      admin_id: null,
      role: 'admin',
    };

    logger.debug('Admin authenticated');
    next();
  } catch (err) {
    logger.error('Admin auth error:', err);
    return res.status(401).json({
      success: false,
      error: 'Invalid admin token',
    });
  }
};

/**
 * Check role permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    // TODO: Implement permission checking
    next();
  };
};

/**
 * Optional user auth (doesn't fail if no token)
 */
const optionalUserAuth = (req, res, next) => {
  try {
    const token = req.headers['x-user-token'];

    if (token) {
      req.user = {
        token,
        profile_id: null,
        role: 'user',
      };
      logger.debug('Optional user authenticated');
    }

    next();
  } catch (err) {
    logger.warn('Optional auth error:', err);
    next();
  }
};

module.exports = {
  checkUserAuth,
  checkAdminAuth,
  requirePermission,
  optionalUserAuth,
};
