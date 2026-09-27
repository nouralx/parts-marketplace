/**
 * Admin Controller — supplier verification & user management.
 * Ported behavior-for-behavior from the original index.js.
 *
 * Note: the original file had a duplicated/broken fragment right before the
 * real GET /admin/user-detail/:id handler (a leftover from a bad edit that
 * actually made the deployed index.js fail `node --check`). That dead code
 * is dropped here; the working handler below is what's kept.
 */

const { pool, supabaseAdmin } = require('../config/db');
const { logAdminActivity } = require('../services/admin-log.service');

// GET /api/admin/supplier-requests
async function getSupplierRequests(req, res) {
  try {
    const result = await pool.query(
      `SELECT sd.id, sd.profile_id, sd.commercial_register_url, sd.payment_receipt_url,
              sd.status, sd.admin_note, sd.created_at,
              p.full_name, p.phone, p.username
       FROM supplier_documents sd
       JOIN profiles p ON p.id = sd.profile_id
       WHERE sd.status = 'pending'
       ORDER BY sd.created_at ASC`
    );
    res.json({ success: true, requests: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/document-url?path=
async function getDocumentUrl(req, res) {
  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ success: false, error: 'المسار مفقود' });
  }
  try {
    const { data, error } = await supabaseAdmin.storage.from('supplier-documents').createSignedUrl(path, 300);
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, url: data.signedUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/admin/review-supplier
async function reviewSupplier(req, res) {
  const { document_id, decision, note } = req.body;

  if (!document_id || !decision || (decision !== 'approved' && decision !== 'rejected')) {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  try {
    const docResult = await pool.query(
      `UPDATE supplier_documents SET status = $1, admin_note = $2, reviewed_at = NOW() WHERE id = $3 RETURNING profile_id`,
      [decision, note || null, document_id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    const profileId = docResult.rows[0].profile_id;

    await pool.query(`UPDATE profiles SET verification_status = $1, updated_at = NOW() WHERE id = $2`, [decision, profileId]);

    if (decision === 'approved') {
      await pool.query(
        `UPDATE suppliers SET subscription_status = 'active', subscription_start = CURRENT_DATE,
         subscription_end = CURRENT_DATE + INTERVAL '1 year', is_verified = true, updated_at = NOW()
         WHERE user_id = $1`,
        [profileId]
      );
    }

    res.json({ success: true, message: 'تم تحديث حالة الطلب' });
    logAdminActivity(req.admin.admin_id, decision === 'approved' ? 'موافقة على مورّد' : 'رفض مورّد', 'supplier_document', document_id, note);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/users
async function getUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, role, full_name, phone, username, is_active, verification_status, created_at
       FROM profiles WHERE role IN ('buyer', 'supplier') ORDER BY created_at DESC`
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/admin/toggle-user-status
async function toggleUserStatus(req, res) {
  const { user_id, is_active } = req.body;

  if (!user_id || typeof is_active !== 'boolean') {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  try {
    await pool.query(`UPDATE profiles SET is_active = $1, updated_at = NOW() WHERE id = $2`, [is_active, user_id]);
    res.json({ success: true, message: 'تم تحديث حالة الحساب' });
    logAdminActivity(req.admin.admin_id, is_active ? 'تفعيل حساب مستخدم' : 'تعطيل حساب مستخدم', 'user', user_id, null);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/user-detail/:id
async function getUserDetail(req, res) {
  const { id } = req.params;

  try {
    const profileResult = await pool.query(
      `SELECT id, full_name, username, phone, role, is_active, created_at, updated_at FROM profiles WHERE id = $1`,
      [id]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    const user = profileResult.rows[0];

    let supplierData = null;
    if (user.role === 'supplier') {
      const supplierResult = await pool.query(
        `SELECT store_name, wilaya, address, is_verified, rating_avg FROM suppliers WHERE user_id = $1`,
        [id]
      );
      if (supplierResult.rows.length > 0) {
        supplierData = supplierResult.rows[0];
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name || '-',
        username: user.username || '-',
        phone: user.phone || '-',
        role: user.role || '-',
        is_active: user.is_active || false,
        created_at: user.created_at,
        updated_at: user.updated_at,
        store_name: supplierData?.store_name || null,
        wilaya: supplierData?.wilaya || null,
        address: supplierData?.address || null,
        is_verified: supplierData?.is_verified || false,
        rating_avg: supplierData?.rating_avg || null,
        record_image: null,
        payment_image: null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل تحميل البيانات' });
  }
}

// DELETE /api/admin/users/:id — cascading delete across all owned data
async function deleteUser(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ success: false, error: 'معرّف المستخدم مطلوب' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query('SELECT * FROM profiles WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    const userName = userResult.rows[0].full_name;

    // Order matters — follow foreign keys from deepest to shallowest.
    await client.query('DELETE FROM supplier_documents WHERE profile_id = $1', [id]);
    await client.query('DELETE FROM user_sessions WHERE profile_id = $1', [id]);

    const ordersResult = await client.query('SELECT id FROM orders WHERE buyer_id = $1', [id]);
    for (const order of ordersResult.rows) {
      await client.query('DELETE FROM order_items WHERE order_id = $1', [order.id]);
    }
    await client.query('DELETE FROM orders WHERE buyer_id = $1', [id]);

    await client.query('DELETE FROM profiles WHERE id = $1', [id]);

    await client.query(`INSERT INTO admin_activity_log (admin_id, action, note) VALUES ($1, $2, $3)`, [
      req.admin.admin_id,
      'delete_user',
      `تم حذف المستخدم "${userName}" وجميع بياناته`,
    ]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم حذف المستخدم وجميع بياناته بنجاح' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
}

module.exports = {
  getSupplierRequests,
  getDocumentUrl,
  reviewSupplier,
  getUsers,
  toggleUserStatus,
  getUserDetail,
  deleteUser,
};
