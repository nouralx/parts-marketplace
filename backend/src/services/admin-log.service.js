const { pool } = require('../config/db');
const logger = require('../config/logger');

// Fire-and-forget audit log entry. Never blocks or fails the calling request.
async function logAdminActivity(adminId, action, targetType, targetId, note) {
  try {
    await pool.query(`INSERT INTO admin_activity_log (admin_id, action, note) VALUES ($1, $2, $3)`, [
      adminId,
      action,
      note || null,
    ]);
  } catch (err) {
    logger.error('فشل تسجيل نشاط الأدمن: ' + err.message);
  }
}

module.exports = { logAdminActivity };
