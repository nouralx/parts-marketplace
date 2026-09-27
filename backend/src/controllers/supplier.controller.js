/**
 * Supplier Controller
 * Proposing new catalog products, and managing per-vehicle price listings.
 */

const { pool, supabaseAdmin } = require('../config/db');
const { getSupplierId } = require('../services/supplier.service');

// GET /api/supplier/profile
// NOTE: this endpoint is referenced by the existing supplier-dashboard.html
// but was never implemented in the original backend (a real gap, not a
// removed feature) — added here so the dashboard actually works.
async function getProfile(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  try {
    const result = await pool.query(
      `SELECT s.id, s.store_name, s.wilaya, s.address, s.is_verified, s.subscription_status, s.subscription_end,
              s.penalty_points, s.rating_avg,
              p.full_name, p.phone, p.username
       FROM suppliers s
       JOIN profiles p ON p.id = s.user_id
       WHERE s.user_id = $1`,
      [req.user.profile_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });
    res.json({ success: true, supplier: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/supplier/propose-product (multipart, up to 6 images)
async function proposeProduct(req, res) {
  if (req.user.role !== 'supplier') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  }
  const { name, description, oem_number, category } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'اسم المنتج مطلوب' });
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'يجب رفع صورة واحدة على الأقل' });
  }

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const productResult = await pool.query(
      `INSERT INTO products (proposed_by_supplier_id, name, description, oem_number, category, condition, is_active, approval_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'new', true, 'pending', NOW(), NOW()) RETURNING id`,
      [supplierId, name, description || null, oem_number || null, category || null]
    );

    const productId = productResult.rows[0].id;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const filePath = `${productId}/${Date.now()}_${i}_${file.originalname}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('product-images')
        .upload(filePath, file.buffer, { contentType: file.mimetype });
      if (uploadError) return res.status(500).json({ success: false, error: 'فشل رفع صورة: ' + uploadError.message });
      const { data: publicUrlData } = supabaseAdmin.storage.from('product-images').getPublicUrl(filePath);
      await pool.query(`INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)`, [
        productId,
        publicUrlData.publicUrl,
        i,
      ]);
    }

    res.json({ success: true, message: 'تم اقتراح المنتج، بانتظار موافقة الإدارة', product_id: productId });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل اقتراح المنتج: ' + err.message });
  }
}

// POST /api/supplier/listings — add a price for an (existing, approved) product + vehicle
async function createListing(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });

  const { product_id, vehicle_id, price, quality_grade, brand, country_of_origin, delivery_type } = req.body;
  if (!product_id || !vehicle_id || !price) {
    return res.status(400).json({ success: false, error: 'المنتج والمركبة والسعر مطلوبة' });
  }

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const productCheck = await pool.query(`SELECT id FROM products WHERE id = $1 AND approval_status = 'approved'`, [product_id]);
    if (productCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'المنتج غير موجود أو غير معتمد' });

    await pool.query(
      `INSERT INTO product_vehicle_pricing
       (product_id, vehicle_id, supplier_id, price, quality_grade, brand, country_of_origin, delivery_type, is_available, is_active, approval_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true, 'pending', NOW(), NOW())`,
      [product_id, vehicle_id, supplierId, price, quality_grade || null, brand || null, country_of_origin || null, delivery_type || 'shipping']
    );

    res.json({ success: true, message: 'تم إضافة عرضك، بانتظار موافقة الإدارة' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إضافة العرض: ' + err.message });
  }
}

// GET /api/supplier/listings
async function getListings(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `SELECT pvp.id, pvp.product_id, pvp.price, pvp.quality_grade, pvp.brand, pvp.country_of_origin, pvp.delivery_type, pvp.is_available, pvp.approval_status, pvp.admin_note,
              p.name AS product_name, vr.make, vr.model, vr.year_start, vr.year_end
       FROM product_vehicle_pricing pvp
       JOIN products p ON p.id = pvp.product_id
       JOIN vehicles_reference vr ON vr.id = pvp.vehicle_id
       WHERE pvp.supplier_id = $1 ORDER BY pvp.created_at DESC`,
      [supplierId]
    );

    const listings = result.rows;
    for (const l of listings) {
      const imgResult = await pool.query(`SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order LIMIT 1`, [
        l.product_id,
      ]);
      l.image = imgResult.rows.length > 0 ? imgResult.rows[0].image_url : null;
    }

    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/supplier/proposed-products
async function getProposedProducts(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `SELECT id, name, oem_number, category, approval_status, admin_note, created_at
       FROM products WHERE proposed_by_supplier_id = $1 ORDER BY created_at DESC`,
      [supplierId]
    );

    const products = result.rows;
    for (const p of products) {
      const imgResult = await pool.query(`SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order LIMIT 1`, [p.id]);
      p.image = imgResult.rows.length > 0 ? imgResult.rows[0].image_url : null;
    }

    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/supplier/listings/:id/price — editing price resets it to pending review
async function updateListingPrice(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  const { price } = req.body;
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    return res.status(400).json({ success: false, error: 'السعر غير صحيح' });
  }

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `UPDATE product_vehicle_pricing SET price = $1, approval_status = 'pending', updated_at = NOW()
       WHERE id = $2 AND supplier_id = $3 RETURNING id`,
      [price, id, supplierId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'العرض غير موجود أو ليس ملكك' });
    res.json({ success: true, message: 'تم تحديث السعر، بانتظار موافقة الإدارة من جديد' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/supplier/listings/:id/availability
async function updateListingAvailability(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  const { is_available } = req.body;
  if (typeof is_available !== 'boolean') return res.status(400).json({ success: false, error: 'قيمة غير صحيحة' });

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `UPDATE product_vehicle_pricing SET is_available = $1, updated_at = NOW() WHERE id = $2 AND supplier_id = $3 RETURNING id`,
      [is_available, id, supplierId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'العرض غير موجود أو ليس ملكك' });
    res.json({ success: true, message: 'تم تحديث حالة التوفر' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/supplier/listings/:id — rejected listings only
async function deleteListing(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `DELETE FROM product_vehicle_pricing WHERE id = $1 AND supplier_id = $2 AND approval_status = 'rejected' RETURNING id`,
      [id, supplierId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'لا يمكن حذف هذا العرض (غير موجود، ليس ملكك، أو غير مرفوض)' });
    }
    res.json({ success: true, message: 'تم حذف العرض' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/supplier/proposed-products/:id — rejected proposals only
async function deleteProposedProduct(req, res) {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const check = await pool.query(
      `SELECT id FROM products WHERE id = $1 AND proposed_by_supplier_id = $2 AND approval_status = 'rejected'`,
      [id, supplierId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'لا يمكن حذف هذا الاقتراح (غير موجود، ليس ملكك، أو غير مرفوض)' });
    }

    await pool.query(`DELETE FROM product_images WHERE product_id = $1`, [id]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);

    res.json({ success: true, message: 'تم حذف الاقتراح' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getProfile,
  proposeProduct,
  createListing,
  getListings,
  getProposedProducts,
  updateListingPrice,
  updateListingAvailability,
  deleteListing,
  deleteProposedProduct,
};
