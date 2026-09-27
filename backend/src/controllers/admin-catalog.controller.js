/**
 * Admin Controller — product/pricing review, catalog management,
 * order oversight, and the activity log.
 * Ported behavior-for-behavior from the original index.js.
 */

const { pool } = require('../config/db');
const { logAdminActivity } = require('../services/admin-log.service');

// GET /api/admin/pending-products
async function getPendingProducts(req, res) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.oem_number, p.category, p.created_at,
              s.store_name, pr.full_name, pr.phone
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.proposed_by_supplier_id
       LEFT JOIN profiles pr ON pr.id = s.user_id
       WHERE p.approval_status = 'pending'
       ORDER BY p.created_at ASC`
    );

    const productIds = result.rows.map((p) => p.id);
    const images = {};

    if (productIds.length > 0) {
      const imagesResult = await pool.query(
        `SELECT product_id, image_url FROM product_images WHERE product_id = ANY($1::int[]) ORDER BY product_id, sort_order`,
        [productIds]
      );
      for (const img of imagesResult.rows) {
        if (!images[img.product_id]) images[img.product_id] = [];
        images[img.product_id].push(img.image_url);
      }
    }

    for (const product of result.rows) {
      product.images = images[product.id] || [];
    }

    res.json({ success: true, products: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/all-approved-products
async function getAllApprovedProducts(req, res) {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.oem_number, p.category, p.created_at, p.approval_status,
              COUNT(DISTINCT pvp.id) as supplier_count
       FROM products p
       LEFT JOIN product_vehicle_pricing pvp ON pvp.product_id = p.id AND pvp.approval_status = 'approved'
       WHERE p.approval_status = 'approved'
       GROUP BY p.id, p.name, p.description, p.oem_number, p.category, p.created_at, p.approval_status
       ORDER BY p.created_at DESC`
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, products: [] });
    }

    const productIds = result.rows.map((p) => p.id);
    const images = {};

    const imagesResult = await pool.query(
      `SELECT product_id, image_url FROM product_images WHERE product_id = ANY($1::int[]) ORDER BY product_id, sort_order`,
      [productIds]
    );
    for (const img of imagesResult.rows) {
      if (!images[img.product_id]) images[img.product_id] = [];
      images[img.product_id].push(img.image_url);
    }

    for (const product of result.rows) {
      product.images = images[product.id] || [];
      product.image_urls = product.images.join(',');
    }

    res.json({ success: true, products: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/product-suppliers/:productId
async function getProductSuppliers(req, res) {
  const { productId } = req.params;
  try {
    const suppliers = await pool.query(
      `SELECT pvp.id, pvp.price, pvp.quality_grade, pvp.brand, pvp.country_of_origin, pvp.delivery_type,
              vr.make, vr.model, vr.year_start, vr.year_end,
              s.store_name, s.wilaya, s.is_verified, pr.phone
       FROM product_vehicle_pricing pvp
       JOIN vehicles_reference vr ON vr.id = pvp.vehicle_id
       JOIN suppliers s ON s.id = pvp.supplier_id
       JOIN profiles pr ON pr.id = s.user_id
       WHERE pvp.product_id = $1 AND pvp.approval_status = 'approved'
       ORDER BY pvp.price ASC`,
      [productId]
    );
    res.json({ success: true, suppliers: suppliers.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/admin/products/:id — simple cascading delete
async function deleteProductSimple(req, res) {
  const { id } = req.params;

  if (!req.admin || !req.admin.admin_id) {
    return res.status(401).json({ success: false, error: 'الجلسة منتهية' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM product_images WHERE product_id = $1', [id]);
    await client.query('DELETE FROM product_vehicle_pricing WHERE product_id = $1', [id]);
    const result = await client.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    }

    await client.query(`INSERT INTO admin_activity_log (admin_id, action, note) VALUES ($1, $2, $3)`, [
      req.admin.admin_id,
      'delete_product',
      `تم حذف المنتج رقم ${id} بالكامل`,
    ]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
}

// POST /api/admin/review-product
async function reviewProduct(req, res) {
  const { product_id, decision, note } = req.body;

  if (!product_id || (decision !== 'approved' && decision !== 'rejected')) {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }
  if (decision === 'rejected' && (!note || !note.trim())) {
    return res.status(400).json({ success: false, error: 'سبب الرفض مطلوب' });
  }

  try {
    await pool.query(`UPDATE products SET approval_status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`, [
      decision,
      note || null,
      product_id,
    ]);
    res.json({ success: true, message: 'تم تحديث حالة المنتج' });
    logAdminActivity(req.admin.admin_id, decision === 'approved' ? 'موافقة على منتج' : 'رفض منتج', 'product', product_id, note);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/pending-pricing
async function getPendingPricing(req, res) {
  try {
    const result = await pool.query(
      `SELECT pvp.id, pvp.product_id, pvp.price, pvp.quality_grade, pvp.brand, pvp.country_of_origin, pvp.delivery_type, pvp.created_at,
              p.name AS product_name,
              vr.make, vr.model, vr.year_start, vr.year_end,
              s.store_name
       FROM product_vehicle_pricing pvp
       JOIN products p ON p.id = pvp.product_id
       JOIN vehicles_reference vr ON vr.id = pvp.vehicle_id
       JOIN suppliers s ON s.id = pvp.supplier_id
       WHERE pvp.approval_status = 'pending'
       ORDER BY pvp.created_at ASC`
    );
    res.json({ success: true, pricing: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/admin/review-pricing
async function reviewPricing(req, res) {
  const { pricing_id, decision, note } = req.body;

  if (!pricing_id || (decision !== 'approved' && decision !== 'rejected')) {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }
  if (decision === 'rejected' && (!note || !note.trim())) {
    return res.status(400).json({ success: false, error: 'سبب الرفض مطلوب' });
  }

  try {
    await pool.query(`UPDATE product_vehicle_pricing SET approval_status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`, [
      decision,
      note || null,
      pricing_id,
    ]);
    res.json({ success: true, message: 'تم تحديث حالة السعر' });
    logAdminActivity(req.admin.admin_id, decision === 'approved' ? 'موافقة على سعر' : 'رفض سعر', 'pricing', pricing_id, note);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/activity-log — main admin only
async function getActivityLog(req, res) {
  if (req.admin.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للأدمن الرئيسي فقط' });
  }
  try {
    const result = await pool.query(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.note, al.created_at, p.full_name AS admin_name
       FROM admin_activity_log al
       JOIN profiles p ON p.id = al.admin_id
       ORDER BY al.created_at DESC LIMIT 300`
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/admin/activity-log — main admin only, bulk or single
async function deleteActivityLog(req, res) {
  if (req.admin.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للأدمن الرئيسي فقط' });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'يجب تحديد سجل واحد على الأقل' });
  }
  try {
    const result = await pool.query(`DELETE FROM admin_activity_log WHERE id = ANY($1::bigint[]) RETURNING id`, [ids]);
    res.json({ success: true, message: `تم حذف ${result.rows.length} سجل`, deleted_count: result.rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/admin/orders
async function getAdminOrders(req, res) {
  try {
    const ordersResult = await pool.query(
      `SELECT o.id, o.status, o.total_amount, o.shipping_address, o.shipping_wilaya, o.phone_contact, o.notes, o.created_at,
              p.full_name AS buyer_name, p.phone AS buyer_phone
       FROM orders o
       JOIN profiles p ON p.id = o.buyer_id
       ORDER BY o.created_at DESC`
    );

    const orders = ordersResult.rows;
    for (const order of orders) {
      const itemsResult = await pool.query(
        `SELECT oi.id, oi.quantity, oi.unit_price, oi.item_status,
                pr.name AS product_name, s.store_name
         FROM order_items oi
         JOIN products pr ON pr.id = oi.product_id
         JOIN suppliers s ON s.id = oi.supplier_id
         WHERE oi.order_id = $1`,
        [order.id]
      );
      order.items = itemsResult.rows;
    }

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/admin/delete-product/:id — thorough delete (also cleans dangling orders)
async function deleteProductThorough(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'يجب توفير سبب الحذف' });
  }

  try {
    const productResult = await pool.query(`SELECT id, name FROM products WHERE id = $1 AND approval_status = 'approved'`, [id]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'المنتج غير موجود أو غير معتمد' });
    }
    const productName = productResult.rows[0].name;

    await pool.query(`DELETE FROM product_images WHERE product_id = $1`, [id]);
    await pool.query(`DELETE FROM product_vehicle_pricing WHERE product_id = $1`, [id]);
    await pool.query(
      `DELETE FROM order_items WHERE pricing_id IN (SELECT id FROM product_vehicle_pricing WHERE product_id = $1) RETURNING order_id`,
      [id]
    );
    await pool.query(`DELETE FROM orders WHERE id NOT IN (SELECT DISTINCT order_id FROM order_items)`);
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);

    await pool.query(`INSERT INTO admin_activity_log (admin_id, action, note) VALUES ($1, $2, $3)`, [
      req.admin.admin_id,
      'delete_product',
      `حذف المنتج: ${productName}`,
    ]);

    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء حذف المنتج: ' + err.message });
  }
}

// POST /api/admin/delete-products-bulk
async function deleteProductsBulk(req, res) {
  const { productIds, reason } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ success: false, error: 'يجب اختيار منتج واحد على الأقل' });
  }
  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'يجب توفير سبب الحذف' });
  }

  try {
    let deletedCount = 0;
    const deletedNames = [];

    for (const id of productIds) {
      const productResult = await pool.query(`SELECT id, name FROM products WHERE id = $1 AND approval_status = 'approved'`, [id]);
      if (productResult.rows.length === 0) continue;

      deletedNames.push(productResult.rows[0].name);

      await pool.query(`DELETE FROM product_images WHERE product_id = $1`, [id]);
      await pool.query(`DELETE FROM product_vehicle_pricing WHERE product_id = $1`, [id]);
      await pool.query(
        `DELETE FROM order_items WHERE pricing_id IN (SELECT id FROM product_vehicle_pricing WHERE product_id = $1)`,
        [id]
      );
      await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
      deletedCount++;
    }

    await pool.query(`DELETE FROM orders WHERE id NOT IN (SELECT DISTINCT order_id FROM order_items)`);

    await pool.query(`INSERT INTO admin_activity_log (admin_id, action, note) VALUES ($1, $2, $3)`, [
      req.admin.admin_id,
      'delete_products_bulk',
      `حذف ${deletedCount} منتج(ات)`,
    ]);

    res.json({ success: true, message: `تم حذف ${deletedCount} منتج بنجاح`, deleted_count: deletedCount, deleted_names: deletedNames });
  } catch (err) {
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء حذف المنتجات: ' + err.message });
  }
}

module.exports = {
  getPendingProducts,
  getAllApprovedProducts,
  getProductSuppliers,
  deleteProductSimple,
  reviewProduct,
  getPendingPricing,
  reviewPricing,
  getActivityLog,
  deleteActivityLog,
  getAdminOrders,
  deleteProductThorough,
  deleteProductsBulk,
};
