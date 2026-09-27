/**
 * Catalog Controller
 * Public product catalog (visible to everyone) + the reference vehicles list.
 * Seller identity/pricing is only attached for logged-in users
 * (optionalUserAuth sets req.user = null for guests).
 */

const { pool } = require('../config/db');

// GET /api/vehicles?search=
async function getVehicles(req, res) {
  const { search } = req.query;
  try {
    const result = search
      ? await pool.query(
          `SELECT id, make, model, year_start, year_end, body_type
           FROM vehicles_reference
           WHERE make ILIKE $1 OR model ILIKE $1
           ORDER BY make, model LIMIT 30`,
          [`%${search}%`]
        )
      : await pool.query(
          `SELECT id, make, model, year_start, year_end, body_type FROM vehicles_reference ORDER BY make, model LIMIT 30`
        );
    res.json({ success: true, vehicles: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/vehicles (requires login — any authenticated user can add a
// reference vehicle that's missing, same as the original behavior)
async function createVehicle(req, res) {
  const { make, model, year_start, year_end, body_type } = req.body;

  if (!make || !model || !year_start || !year_end) {
    return res.status(400).json({ success: false, error: 'الماركة، الطراز، وسنوات الصنع مطلوبة' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO vehicles_reference (make, model, year_start, year_end, body_type, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, make, model, year_start, year_end, body_type`,
      [make, model, parseInt(year_start, 10), parseInt(year_end, 10), body_type || null]
    );
    res.json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/catalog/search?search=
async function searchCatalog(req, res) {
  const { search } = req.query;
  try {
    const result = search
      ? await pool.query(
          `SELECT id, name, oem_number, category FROM products
           WHERE approval_status = 'approved' AND (name ILIKE $1 OR oem_number ILIKE $1)
           ORDER BY name LIMIT 30`,
          [`%${search}%`]
        )
      : await pool.query(
          `SELECT id, name, oem_number, category FROM products
           WHERE approval_status = 'approved' ORDER BY created_at DESC LIMIT 30`
        );

    const products = result.rows;
    for (const p of products) {
      const imgs = await pool.query(`SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [p.id]);
      p.images = imgs.rows.map((r) => r.image_url);
      const cnt = await pool.query(
        `SELECT COUNT(*) FROM product_vehicle_pricing WHERE product_id = $1 AND approval_status = 'approved' AND is_available = true`,
        [p.id]
      );
      p.offers_count = parseInt(cnt.rows[0].count, 10);
    }
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/catalog/:id — full detail. Guests get the product + how many
// offers exist but not who's selling; logged-in users get the full offer list.
async function getCatalogDetail(req, res) {
  const { id } = req.params;
  try {
    const productResult = await pool.query(
      `SELECT id, name, description, oem_number, category, condition FROM products
       WHERE id = $1 AND approval_status = 'approved'`,
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    }

    const product = productResult.rows[0];
    const imgs = await pool.query(`SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [id]);
    product.images = imgs.rows.map((r) => r.image_url);

    if (!req.user) {
      const cnt = await pool.query(
        `SELECT COUNT(*) FROM product_vehicle_pricing WHERE product_id = $1 AND approval_status = 'approved' AND is_available = true`,
        [id]
      );
      product.offers_count = parseInt(cnt.rows[0].count, 10);
      product.offers = null;
      product.login_required = true;
      return res.json({ success: true, product });
    }

    const offers = await pool.query(
      `SELECT pvp.id, pvp.price, pvp.quality_grade, pvp.brand, pvp.country_of_origin, pvp.delivery_type,
              vr.make, vr.model, vr.year_start, vr.year_end,
              s.store_name, s.wilaya, s.is_verified, pr.phone
       FROM product_vehicle_pricing pvp
       JOIN vehicles_reference vr ON vr.id = pvp.vehicle_id
       JOIN suppliers s ON s.id = pvp.supplier_id
       JOIN profiles pr ON pr.id = s.user_id
       WHERE pvp.product_id = $1 AND pvp.approval_status = 'approved' AND pvp.is_available = true
       ORDER BY pvp.price ASC`,
      [id]
    );

    product.offers = offers.rows;
    product.login_required = false;
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getVehicles, createVehicle, searchCatalog, getCatalogDetail };
