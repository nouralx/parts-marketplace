/**
 * SMS Gateway Controller
 * The Android bridge app polls /pending, sends via SmsManager, then /confirm.
 * Protected by a shared secret header, not a user/admin session.
 */

const { pool } = require('../config/db');

// GET /sms/pending
async function getPendingSms(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, phone, message FROM sms_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5`
    );
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /sms/confirm
async function confirmSms(req, res) {
  const { id, status } = req.body;
  if (!id || !status) {
    return res.status(400).json({ error: 'Missing id or status' });
  }
  try {
    await pool.query(`UPDATE sms_queue SET status = $1, sent_at = NOW() WHERE id = $2`, [status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getPendingSms, confirmSms };
