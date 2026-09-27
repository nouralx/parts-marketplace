/**
 * Orders Controller
 * Buyers create multi-item orders (one DB transaction across suppliers);
 * suppliers see only their own order_items and can update their status.
 */

const { pool } = require('../config/db');
const { getSupplierId } = require('../services/supplier.service');

// POST /api/orders
async function createOrder(req, res) {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للمشترين فقط' });
  }

  const { items, shipping_address, shipping_wilaya, phone_contact, notes } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'يجب إضافة منتج واحد على الأقل' });
  }

  if (!shipping_address || !shipping_wilaya || !phone_contact) {
    return res.status(400).json({ success: false, error: 'عنوان الشحن والولاية ورقم الهاتف مطلوبة' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let totalAmount = 0;
    const resolvedItems = [];

    for (const item of items) {
      const { product_id, pricing_id, quantity } = item;

      if (!product_id || !pricing_id || !quantity || quantity < 1) {
        throw { status: 400, message: 'بيانات المنتج غير مكتملة' };
      }

      const pricingResult = await client.query(
        `SELECT pvp.price, pvp.approval_status, pvp.is_available, pvp.supplier_id,
                p.approval_status AS product_status, p.is_active AS product_active
         FROM product_vehicle_pricing pvp
         JOIN products p ON p.id = pvp.product_id
         WHERE pvp.id = $1 AND pvp.product_id = $2`,
        [pricing_id, product_id]
      );

      if (pricingResult.rows.length === 0) {
        throw { status: 404, message: 'السعر أو المنتج غير موجود' };
      }

      const pricing = pricingResult.rows[0];

      if (
        pricing.approval_status !== 'approved' ||
        !pricing.is_available ||
        pricing.product_status !== 'approved' ||
        !pricing.product_active
      ) {
        throw { status: 400, message: 'أحد المنتجات لم يعد متوفراً' };
      }

      const unitPrice = parseFloat(pricing.price);
      totalAmount += unitPrice * quantity;

      resolvedItems.push({
        product_id,
        pricing_id,
        supplier_id: pricing.supplier_id,
        quantity,
        unit_price: unitPrice,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, status, total_amount, shipping_address, shipping_wilaya, phone_contact, notes, created_at, updated_at)
       VALUES ($1, 'pending', $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id`,
      [req.user.profile_id, totalAmount, shipping_address, shipping_wilaya, phone_contact, notes || null]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, pricing_id, supplier_id, quantity, unit_price, item_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
        [orderId, item.product_id, item.pricing_id, item.supplier_id, item.quantity, item.unit_price]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'تم إنشاء الطلب بنجاح', order_id: orderId, total_amount: totalAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message || 'فشل إنشاء الطلب' });
  } finally {
    client.release();
  }
}

// GET /api/buyer/orders
async function getBuyerOrders(req, res) {
  if (req.user.role !== 'buyer') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للمشترين فقط' });
  }

  try {
    const ordersResult = await pool.query(
      `SELECT id, status, total_amount, shipping_address, shipping_wilaya, phone_contact, notes, created_at
       FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC`,
      [req.user.profile_id]
    );

    const orders = ordersResult.rows;

    for (const order of orders) {
      const itemsResult = await pool.query(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, oi.item_status,
                p.name AS product_name, s.store_name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
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

// GET /api/supplier/orders — this supplier's own order_items across all orders
async function getSupplierOrderItems(req, res) {
  if (req.user.role !== 'supplier') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  }

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });
    }

    const result = await pool.query(
      `SELECT oi.id, oi.order_id, oi.quantity, oi.unit_price, oi.item_status, oi.created_at,
              p.name AS product_name,
              o.shipping_address, o.shipping_wilaya, o.phone_contact, o.status AS order_status,
              pr.full_name AS buyer_name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       JOIN profiles pr ON pr.id = o.buyer_id
       WHERE oi.supplier_id = $1
       ORDER BY oi.created_at DESC`,
      [supplierId]
    );

    res.json({ success: true, items: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/supplier/orders/:item_id/status
async function updateOrderItemStatus(req, res) {
  if (req.user.role !== 'supplier') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  }

  const { item_id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ['confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'حالة غير صحيحة' });
  }

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });
    }

    const result = await pool.query(`UPDATE order_items SET item_status = $1 WHERE id = $2 AND supplier_id = $3 RETURNING id`, [
      status,
      item_id,
      supplierId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'العنصر غير موجود أو ليس ملكك' });
    }

    res.json({ success: true, message: 'تم تحديث حالة الطلب' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { createOrder, getBuyerOrders, getSupplierOrderItems, updateOrderItemStatus };
