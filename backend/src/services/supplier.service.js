const { pool } = require('../config/db');

// A supplier's `suppliers.id` differs from their `profiles.id` (user_id FK).
// Every supplier-scoped endpoint needs this resolved first.
async function getSupplierId(profileId) {
  const result = await pool.query(`SELECT id FROM suppliers WHERE user_id = $1`, [profileId]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

module.exports = { getSupplierId };
