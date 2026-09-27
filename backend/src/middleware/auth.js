/**
 * Authentication & Authorization middleware
 * Token-based sessions stored in `user_sessions` / `admin_sessions` tables
 * (ported behavior-for-behavior from the original index.js).
 */

const { pool } = require('../config/db');

// Require a logged-in buyer/supplier. Reads token from x-user-token header.
async function checkUserAuth(req, res, next) {
  const token = req.headers['x-user-token'];

  if (!token) {
    return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول' });
  }

  try {
    const result = await pool.query(
      `SELECT s.profile_id, p.role, p.full_name, p.verification_status
       FROM user_sessions s
       JOIN profiles p ON p.id = s.profile_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'الجلسة منتهية، سجّل الدخول من جديد' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Optional auth for public endpoints (catalog) — logged-in users get extra
// info (e.g. seller identity), guests still get a response with req.user = null.
async function optionalUserAuth(req, res, next) {
  const token = req.headers['x-user-token'];
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const result = await pool.query(
      `SELECT s.profile_id, p.role, p.full_name
       FROM user_sessions s JOIN profiles p ON p.id = s.profile_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    req.user = result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    req.user = null;
  }
  next();
}

// Require a logged-in admin/staff member. Reads token from x-admin-token header.
async function checkAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];

  if (!token) {
    return res.status(401).json({ success: false, error: 'يجب تسجيل الدخول' });
  }

  try {
    const result = await pool.query(
      `SELECT s.admin_id, p.role, p.full_name
       FROM admin_sessions s
       JOIN profiles p ON p.id = s.admin_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'الجلسة منتهية، سجّل الدخول من جديد' });
    }

    req.admin = result.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Fine-grained staff permissions. The main admin role bypasses all checks;
// staff members need the named boolean column set true in staff_permissions.
function requirePermission(permissionName) {
  const allowedColumns = [
    'can_review_suppliers',
    'can_manage_users',
    'can_manage_products',
    'can_delete_products',
    'can_manage_orders',
  ];
  if (!allowedColumns.includes(permissionName)) {
    throw new Error(`Unknown permission column: ${permissionName}`);
  }

  return async function (req, res, next) {
    if (req.admin.role === 'admin') {
      return next();
    }

    try {
      const result = await pool.query(
        `SELECT ${permissionName} FROM staff_permissions WHERE staff_id = $1`,
        [req.admin.admin_id]
      );

      if (result.rows.length === 0 || !result.rows[0][permissionName]) {
        return res.status(403).json({ success: false, error: 'ليس لديك صلاحية لهذا الإجراء' });
      }

      next();
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

module.exports = { checkUserAuth, optionalUserAuth, checkAdminAuth, requirePermission };
