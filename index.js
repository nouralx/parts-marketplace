const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const agent = new SocksProxyAgent('socks5h://localhost:1055');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.send('الموقع شغال بنجاح!');
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send('الاتصال بقاعدة البيانات نجح: ' + result.rows[0].now);
  } catch (err) {
    res.status(500).send('فشل الاتصال: ' + err.message);
  }
});

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============ فحص توفر اسم المستخدم ============

app.get('/api/check-username', async (req, res) => {
  const { username } = req.query;

  if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.json({ available: false, error: 'صيغة غير صحيحة' });
  }

  try {
    const result = await pool.query(`SELECT id FROM profiles WHERE username = $1`, [username]);
    res.json({ available: result.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ available: false, error: err.message });
  }
});

// ============ نظام OTP (عبر sms_queue) ============

const ipRequestLog = new Map();

function isIpRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 3;

  if (!ipRequestLog.has(ip)) {
    ipRequestLog.set(ip, []);
  }

  const timestamps = ipRequestLog.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  ipRequestLog.set(ip, timestamps);

  return timestamps.length > maxRequests;
}

setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  for (const [ip, timestamps] of ipRequestLog.entries()) {
    const filtered = timestamps.filter(t => now - t < windowMs);
    if (filtered.length === 0) {
      ipRequestLog.delete(ip);
    } else {
      ipRequestLog.set(ip, filtered);
    }
  }
}, 60 * 60 * 1000);

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/send-otp', async (req, res) => {
  const { phone, purpose } = req.body;

  if (!phone || !purpose) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف أو الغرض مفقود' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (isIpRateLimited(clientIp)) {
    return res.status(429).json({ success: false, error: 'عدد كبير من المحاولات من هذا الجهاز، حاول بعد 15 دقيقة' });
  }

  try {
    const recentCheck = await pool.query(
      `SELECT created_at FROM otp_verifications 
       WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (recentCheck.rows.length > 0) {
      const lastCreated = new Date(recentCheck.rows[0].created_at);
      const secondsSince = (Date.now() - lastCreated.getTime()) / 1000;
      if (secondsSince < 60) {
        const waitTime = Math.ceil(60 - secondsSince);
        return res.status(429).json({ 
          success: false, 
          error: `الرجاء الانتظار ${waitTime} ثانية قبل إعادة الإرسال` 
        });
      }
    }

    const windowCheck = await pool.query(
      `SELECT COUNT(*) FROM otp_verifications 
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '3 hours'`,
      [phone]
    );

    if (parseInt(windowCheck.rows[0].count) >= 3) {
      return res.status(429).json({ 
        success: false, 
        error: 'تم تجاوز الحد الأقصى للمحاولات لهذا الرقم، حاول بعد 3 ساعات' 
      });
    }

    const existingProfileCheck = await pool.query(
      `SELECT id FROM profiles WHERE phone = $1`,
      [phone]
    );
    const profileExists = existingProfileCheck.rows.length > 0;

    if ((purpose === 'login' || purpose === 'password_reset') && !profileExists) {
      return res.status(404).json({ success: false, error: 'لا يوجد حساب مسجل بهذا الرقم' });
    }

    if (purpose === 'registration' && profileExists) {
      return res.status(409).json({ 
        success: false, 
        error: 'يوجد حساب مسجل بهذا الرقم مسبقاً', 
        already_registered: true 
      });
    }

    const otpCode = generateOtpCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `INSERT INTO otp_verifications (phone, otp_code, purpose, expires_at, attempts, is_verified)
       VALUES ($1, $2, $3, $4, 0, false)`,
      [phone, otpCode, purpose, expiresAt]
    );

    const message = `رمز التحقق الخاص بك هو: ${otpCode}`;
    await pool.query(
      `INSERT INTO sms_queue (phone, message) VALUES ($1, $2)`,
      [phone, message]
    );

    res.json({ success: true, message: 'تم إرسال رمز التحقق' });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إرسال رمز التحقق: ' + err.message });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  const { phone, otp_code } = req.body;

  if (!phone || !otp_code) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف أو الرمز مفقود' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM otp_verifications 
       WHERE phone = $1 AND otp_code = $2 AND is_verified = false
       ORDER BY created_at DESC LIMIT 1`,
      [phone, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'رمز التحقق غير صحيح' });
    }

    const record = result.rows[0];

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'رمز التحقق منتهي الصلاحية' });
    }

    await pool.query(
      `UPDATE otp_verifications SET is_verified = true WHERE id = $1`,
      [record.id]
    );

    res.json({ success: true, message: 'تم التحقق بنجاح' });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل التحقق: ' + err.message });
  }
});

// ============ إنشاء الحساب النهائي (مع دعم رفع وثائق المورّد وإنشاء صف suppliers) ============

app.post('/api/complete-registration', upload.fields([
  { name: 'commercial_register', maxCount: 1 },
  { name: 'payment_receipt', maxCount: 1 }
]), async (req, res) => {
  const { phone, full_name, role, username, password, store_name, wilaya } = req.body;

  if (!phone || !full_name || !role || !username || !password) {
    return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
  }

  if (role !== 'buyer' && role !== 'supplier') {
    return res.status(400).json({ success: false, error: 'نوع الحساب غير صحيح' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  if (role === 'supplier') {
    if (!req.files || !req.files['commercial_register'] || !req.files['payment_receipt']) {
      return res.status(400).json({ success: false, error: 'يجب رفع السجل التجاري وإيصال الدفع' });
    }
    if (!store_name) {
      return res.status(400).json({ success: false, error: 'اسم المتجر مطلوب' });
    }
  }

  try {
    const verifiedCheck = await pool.query(
      `SELECT id FROM otp_verifications 
       WHERE phone = $1 AND is_verified = true 
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (verifiedCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'يجب التحقق من رقم الهاتف أولاً' });
    }

    const existingPhone = await pool.query(`SELECT id FROM profiles WHERE phone = $1`, [phone]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'يوجد حساب مسجل بهذا الرقم مسبقاً' });
    }

    const existingUsername = await pool.query(`SELECT id FROM profiles WHERE username = $1`, [username]);
    if (existingUsername.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'اسم المستخدم هذا مستخدم بالفعل، اختر اسماً آخر' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone: '+' + phone,
      phone_confirm: true
    });

    if (authError) {
      return res.status(500).json({ success: false, error: 'فشل إنشاء حساب المصادقة: ' + authError.message });
    }

    const newId = authData.user.id;
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationStatus = role === 'supplier' ? 'pending' : 'approved';

    await pool.query(
      `INSERT INTO profiles (id, role, full_name, phone, username, password_hash, is_phone_verified, is_active, verification_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, true, $7, NOW(), NOW())`,
      [newId, role, full_name, phone, username, passwordHash, verificationStatus]
    );

    if (role === 'supplier') {
      const crFile = req.files['commercial_register'][0];
      const receiptFile = req.files['payment_receipt'][0];

      const crPath = `${newId}/commercial_register_${Date.now()}_${crFile.originalname}`;
      const receiptPath = `${newId}/payment_receipt_${Date.now()}_${receiptFile.originalname}`;

      const { error: crUploadError } = await supabaseAdmin.storage
        .from('supplier-documents')
        .upload(crPath, crFile.buffer, { contentType: crFile.mimetype });

      if (crUploadError) {
        return res.status(500).json({ success: false, error: 'فشل رفع السجل التجاري: ' + crUploadError.message });
      }

      const { error: receiptUploadError } = await supabaseAdmin.storage
        .from('supplier-documents')
        .upload(receiptPath, receiptFile.buffer, { contentType: receiptFile.mimetype });

      if (receiptUploadError) {
        return res.status(500).json({ success: false, error: 'فشل رفع إيصال الدفع: ' + receiptUploadError.message });
      }

      await pool.query(
        `INSERT INTO supplier_documents (profile_id, commercial_register_url, payment_receipt_url, status)
         VALUES ($1, $2, $3, 'pending')`,
        [newId, crPath, receiptPath]
      );

      await pool.query(
        `INSERT INTO suppliers (user_id, store_name, wilaya, subscription_status, penalty_points, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', 0, NOW(), NOW())`,
        [newId, store_name, wilaya || null]
      );
    }

    res.json({ success: true, message: 'تم إنشاء الحساب بنجاح', profile_id: newId, verification_status: verificationStatus });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إنشاء الحساب: ' + err.message });
  }
});

// ============ تسجيل الدخول (مستخدمين عاديين) مع نظام جلسات ============

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  try {
    const result = await pool.query(
      `SELECT id, role, full_name, username, password_hash, is_active, verification_status FROM profiles WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const profile = result.rows[0];

    if (!profile.is_active) {
      return res.status(403).json({ success: false, error: 'هذا الحساب موقوف، تواصل مع الدعم' });
    }

    const passwordMatch = await bcrypt.compare(password, profile.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO user_sessions (token, profile_id, expires_at) VALUES ($1, $2, $3)`,
      [token, profile.id, expiresAt]
    );

    delete profile.password_hash;

    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', profile, token });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل تسجيل الدخول: ' + err.message });
  }
});

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

// مصادقة اختيارية: تستعمل في نقاط النهاية العامة (الكتالوج) اللي يشوفها الجميع
// لكن المسجلين الدخول يشوفون معلومات إضافية (معلومات البائع)
async function optionalUserAuth(req, res, next) {
  const token = req.headers['x-user-token'];
  if (!token) { req.user = null; return next(); }
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

// ============ إعادة تعيين كلمة المرور ============

app.post('/api/reset-password', async (req, res) => {
  const { phone, otp_code, new_password } = req.body;

  if (!phone || !otp_code || !new_password) {
    return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM otp_verifications 
       WHERE phone = $1 AND otp_code = $2 AND purpose = 'password_reset' AND is_verified = false
       ORDER BY created_at DESC LIMIT 1`,
      [phone, otp_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'رمز التحقق غير صحيح' });
    }

    const record = result.rows[0];

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'رمز التحقق منتهي الصلاحية' });
    }

    await pool.query(`UPDATE otp_verifications SET is_verified = true WHERE id = $1`, [record.id]);

    const passwordHash = await bcrypt.hash(new_password, 10);

    const updateResult = await pool.query(
      `UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE phone = $2 RETURNING id`,
      [passwordHash, phone]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'لا يوجد حساب مرتبط بهذا الرقم' });
    }

    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل تغيير كلمة المرور: ' + err.message });
  }
});

// ============ المركبات المرجعية ============

app.get('/api/vehicles', async (req, res) => {
  const { search } = req.query;

  try {
    let result;
    if (search) {
      result = await pool.query(
        `SELECT id, make, model, year_start, year_end, body_type 
         FROM vehicles_reference 
         WHERE make ILIKE $1 OR model ILIKE $1
         ORDER BY make, model LIMIT 30`,
        [`%${search}%`]
      );
    } else {
      result = await pool.query(
        `SELECT id, make, model, year_start, year_end, body_type FROM vehicles_reference ORDER BY make, model LIMIT 30`
      );
    }
    res.json({ success: true, vehicles: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/vehicles', checkUserAuth, async (req, res) => {
  const { make, model, year_start, year_end, body_type } = req.body;

  if (!make || !model || !year_start || !year_end) {
    return res.status(400).json({ success: false, error: 'الماركة، الطراز، وسنوات الصنع مطلوبة' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO vehicles_reference (make, model, year_start, year_end, body_type, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, make, model, year_start, year_end, body_type`,
      [make, model, parseInt(year_start), parseInt(year_end), body_type || null]
    );
    res.json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ أدوات مساعدة عامة ============

async function getSupplierId(profileId) {
  const result = await pool.query(`SELECT id FROM suppliers WHERE user_id = $1`, [profileId]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// ============ كتالوج المنتجات (عام - يشوفه الجميع) ============
// المنتج (الصورة + الاسم) يخص الموقع. معلومات البائع (السعر والتواصل) تظهر فقط للمسجلين الدخول.

app.get('/api/catalog/search', optionalUserAuth, async (req, res) => {
  const { search } = req.query;
  try {
    const result = search
      ? await pool.query(
          `SELECT id, name, oem_number, category FROM products
           WHERE approval_status = 'approved' AND (name ILIKE $1 OR oem_number ILIKE $1)
           ORDER BY name LIMIT 30`, [`%${search}%`])
      : await pool.query(
          `SELECT id, name, oem_number, category FROM products
           WHERE approval_status = 'approved' ORDER BY created_at DESC LIMIT 30`);

    const products = result.rows;
    for (const p of products) {
      const imgs = await pool.query(`SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [p.id]);
      p.images = imgs.rows.map(r => r.image_url);
      const cnt = await pool.query(
        `SELECT COUNT(*) FROM product_vehicle_pricing WHERE product_id = $1 AND approval_status = 'approved' AND is_available = true`,
        [p.id]);
      p.offers_count = parseInt(cnt.rows[0].count);
    }
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/catalog/:id', optionalUserAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const productResult = await pool.query(
      `SELECT id, name, description, oem_number, category, condition FROM products
       WHERE id = $1 AND approval_status = 'approved'`, [id]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    }

    const product = productResult.rows[0];
    const imgs = await pool.query(`SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [id]);
    product.images = imgs.rows.map(r => r.image_url);

    if (!req.user) {
      const cnt = await pool.query(
        `SELECT COUNT(*) FROM product_vehicle_pricing WHERE product_id = $1 AND approval_status = 'approved' AND is_available = true`,
        [id]);
      product.offers_count = parseInt(cnt.rows[0].count);
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
       ORDER BY pvp.price ASC`, [id]);

    product.offers = offers.rows;
    product.login_required = false;
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ المورّد: اقتراح منتج جديد للكتالوج ============

app.post('/api/supplier/propose-product', checkUserAuth, upload.array('images', 6), async (req, res) => {
  if (req.user.role !== 'supplier') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  }
  const { name, description, oem_number, category } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'اسم المنتج مطلوب' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'يجب رفع صورة واحدة على الأقل' });

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const productResult = await pool.query(
      `INSERT INTO products (proposed_by_supplier_id, name, description, oem_number, category, condition, is_active, approval_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'new', true, 'pending', NOW(), NOW()) RETURNING id`,
      [supplierId, name, description || null, oem_number || null, category || null]);

    const productId = productResult.rows[0].id;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const filePath = `${productId}/${Date.now()}_${i}_${file.originalname}`;
      const { error: uploadError } = await supabaseAdmin.storage.from('product-images').upload(filePath, file.buffer, { contentType: file.mimetype });
      if (uploadError) return res.status(500).json({ success: false, error: 'فشل رفع صورة: ' + uploadError.message });
      const { data: publicUrlData } = supabaseAdmin.storage.from('product-images').getPublicUrl(filePath);
      await pool.query(`INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)`, [productId, publicUrlData.publicUrl, i]);
    }

    res.json({ success: true, message: 'تم اقتراح المنتج، بانتظار موافقة الإدارة', product_id: productId });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل اقتراح المنتج: ' + err.message });
  }
});

// ============ المورّد: عروضه (السعر لكل مركبة) ============

app.post('/api/supplier/listings', checkUserAuth, async (req, res) => {
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
      [product_id, vehicle_id, supplierId, price, quality_grade || null, brand || null, country_of_origin || null, delivery_type || 'shipping']);

    res.json({ success: true, message: 'تم إضافة عرضك، بانتظار موافقة الإدارة' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إضافة العرض: ' + err.message });
  }
});

app.get('/api/supplier/listings', checkUserAuth, async (req, res) => {
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
       WHERE pvp.supplier_id = $1 ORDER BY pvp.created_at DESC`, [supplierId]);

    const listings = result.rows;
    for (const l of listings) {
      const imgResult = await pool.query(
        `SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order LIMIT 1`,
        [l.product_id]);
      l.image = imgResult.rows.length > 0 ? imgResult.rows[0].image_url : null;
    }

    res.json({ success: true, listings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/supplier/proposed-products', checkUserAuth, async (req, res) => {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `SELECT id, name, oem_number, category, approval_status, admin_note, created_at
       FROM products WHERE proposed_by_supplier_id = $1 ORDER BY created_at DESC`,
      [supplierId]);

    const products = result.rows;
    for (const p of products) {
      const imgResult = await pool.query(
        `SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order LIMIT 1`,
        [p.id]);
      p.image = imgResult.rows.length > 0 ? imgResult.rows[0].image_url : null;
    }

    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/supplier/listings/:id/price', checkUserAuth, async (req, res) => {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  const { price } = req.body;
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    return res.status(400).json({ success: false, error: 'السعر غير صحيح' });
  }

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    // أي تعديل على السعر يعيد العرض لحالة "قيد المراجعة" حتى توافق عليه الإدارة من جديد
    const result = await pool.query(
      `UPDATE product_vehicle_pricing SET price = $1, approval_status = 'pending', updated_at = NOW()
       WHERE id = $2 AND supplier_id = $3 RETURNING id`,
      [price, id, supplierId]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'العرض غير موجود أو ليس ملكك' });
    res.json({ success: true, message: 'تم تحديث السعر، بانتظار موافقة الإدارة من جديد' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/supplier/listings/:id/availability', checkUserAuth, async (req, res) => {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  const { is_available } = req.body;
  if (typeof is_available !== 'boolean') return res.status(400).json({ success: false, error: 'قيمة غير صحيحة' });

  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `UPDATE product_vehicle_pricing SET is_available = $1, updated_at = NOW() WHERE id = $2 AND supplier_id = $3 RETURNING id`,
      [is_available, id, supplierId]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'العرض غير موجود أو ليس ملكك' });
    res.json({ success: true, message: 'تم تحديث حالة التوفر' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// حذف عرض مرفوض فقط (لا يمكن حذف عرض معتمد أو قيد المراجعة لتفادي فقدان بيانات نشطة بالخطأ)
app.delete('/api/supplier/listings/:id', checkUserAuth, async (req, res) => {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const result = await pool.query(
      `DELETE FROM product_vehicle_pricing WHERE id = $1 AND supplier_id = $2 AND approval_status = 'rejected' RETURNING id`,
      [id, supplierId]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'لا يمكن حذف هذا العرض (غير موجود، ليس ملكك، أو غير مرفوض)' });
    res.json({ success: true, message: 'تم حذف العرض' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// حذف منتج مقترح مرفوض فقط (نحذف الصور المرتبطة أولاً لتفادي مشاكل المفتاح الأجنبي)
app.delete('/api/supplier/proposed-products/:id', checkUserAuth, async (req, res) => {
  if (req.user.role !== 'supplier') return res.status(403).json({ success: false, error: 'هذه الميزة للموردين فقط' });
  const { id } = req.params;
  try {
    const supplierId = await getSupplierId(req.user.profile_id);
    if (!supplierId) return res.status(404).json({ success: false, error: 'لم يتم العثور على ملف المورّد' });

    const check = await pool.query(
      `SELECT id FROM products WHERE id = $1 AND proposed_by_supplier_id = $2 AND approval_status = 'rejected'`,
      [id, supplierId]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, error: 'لا يمكن حذف هذا الاقتراح (غير موجود، ليس ملكك، أو غير مرفوض)' });

    await pool.query(`DELETE FROM product_images WHERE product_id = $1`, [id]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);

    res.json({ success: true, message: 'تم حذف الاقتراح' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ نظام الطلبات (Orders) ============

app.post('/api/orders', checkUserAuth, async (req, res) => {
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

      if (pricing.approval_status !== 'approved' || !pricing.is_available ||
          pricing.product_status !== 'approved' || !pricing.product_active) {
        throw { status: 400, message: 'أحد المنتجات لم يعد متوفراً' };
      }

      const unitPrice = parseFloat(pricing.price);
      totalAmount += unitPrice * quantity;

      resolvedItems.push({
        product_id, pricing_id, supplier_id: pricing.supplier_id,
        quantity, unit_price: unitPrice
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
});

app.get('/api/buyer/orders', checkUserAuth, async (req, res) => {
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
});

app.get('/api/supplier/orders', checkUserAuth, async (req, res) => {
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
});

app.post('/api/supplier/orders/:item_id/status', checkUserAuth, async (req, res) => {
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

    const result = await pool.query(
      `UPDATE order_items SET item_status = $1 WHERE id = $2 AND supplier_id = $3 RETURNING id`,
      [status, item_id, supplierId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'العنصر غير موجود أو ليس ملكك' });
    }

    res.json({ success: true, message: 'تم تحديث حالة الطلب' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ نظام جلسات الأدمن/الموظفين ============

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

function requirePermission(permissionName) {
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

// تسجيل كل تحرّك يقوم به الأدمن/الموظف في سجل المحفوظات
async function logAdminActivity(adminId, action, targetType, targetId, note) {
  try {
    await pool.query(
      `INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, note, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [adminId, action, targetType, String(targetId), note || null]
    );
  } catch (err) {
    console.error('فشل تسجيل نشاط الأدمن:', err.message);
  }
}

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  try {
    const result = await pool.query(
      `SELECT id, role, full_name, password_hash, is_active FROM profiles WHERE username = $1 AND role IN ('admin', 'staff')`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const account = result.rows[0];

    if (!account.is_active) {
      return res.status(403).json({ success: false, error: 'هذا الحساب موقوف' });
    }

    const passwordMatch = await bcrypt.compare(password, account.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, $3)`,
      [token, account.id, expiresAt]
    );

    res.json({ 
      success: true, 
      token, 
      role: account.role, 
      full_name: account.full_name 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ لوحة تحكم: طلبات الموردين ============

app.get('/api/admin/supplier-requests', checkAdminAuth, requirePermission('can_review_suppliers'), async (req, res) => {
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
});

app.get('/api/admin/document-url', checkAdminAuth, requirePermission('can_review_suppliers'), async (req, res) => {
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ success: false, error: 'المسار مفقود' });
  }

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('supplier-documents')
      .createSignedUrl(path, 300);

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, url: data.signedUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/review-supplier', checkAdminAuth, requirePermission('can_review_suppliers'), async (req, res) => {
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

    await pool.query(
      `UPDATE profiles SET verification_status = $1, updated_at = NOW() WHERE id = $2`,
      [decision, profileId]
    );

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
});

// ============ لوحة تحكم: إدارة المستخدمين ============

app.get('/api/admin/users', checkAdminAuth, requirePermission('can_manage_users'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, role, full_name, phone, username, is_active, verification_status, created_at 
       FROM profiles 
       WHERE role IN ('buyer', 'supplier')
       ORDER BY created_at DESC`
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/toggle-user-status', checkAdminAuth, requirePermission('can_manage_users'), async (req, res) => {
  const { user_id, is_active } = req.body;

  if (!user_id || typeof is_active !== 'boolean') {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  try {
    await pool.query(
      `UPDATE profiles SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [is_active, user_id]
    );
    res.json({ success: true, message: 'تم تحديث حالة الحساب' });
    logAdminActivity(req.admin.admin_id, is_active ? 'تفعيل حساب مستخدم' : 'تعطيل حساب مستخدم', 'user', user_id, null);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ لوحة تحكم: منتجات وأسعار بانتظار الموافقة ============

app.get('/api/admin/pending-products', checkAdminAuth, requirePermission('can_manage_products'), async (req, res) => {
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

    for (const product of result.rows) {
      const imagesResult = await pool.query(
        `SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order`,
        [product.id]
      );
      product.images = imagesResult.rows.map(r => r.image_url);
    }

    res.json({ success: true, products: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/review-product', checkAdminAuth, requirePermission('can_manage_products'), async (req, res) => {
  const { product_id, decision, note } = req.body;

  if (!product_id || (decision !== 'approved' && decision !== 'rejected')) {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  if (decision === 'rejected' && (!note || !note.trim())) {
    return res.status(400).json({ success: false, error: 'سبب الرفض مطلوب' });
  }

  try {
    await pool.query(
      `UPDATE products SET approval_status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
      [decision, note || null, product_id]
    );
    res.json({ success: true, message: 'تم تحديث حالة المنتج' });
    logAdminActivity(req.admin.admin_id, decision === 'approved' ? 'موافقة على منتج' : 'رفض منتج', 'product', product_id, note);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/pending-pricing', checkAdminAuth, requirePermission('can_manage_products'), async (req, res) => {
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
});

app.post('/api/admin/review-pricing', checkAdminAuth, requirePermission('can_manage_products'), async (req, res) => {
  const { pricing_id, decision, note } = req.body;

  if (!pricing_id || (decision !== 'approved' && decision !== 'rejected')) {
    return res.status(400).json({ success: false, error: 'بيانات غير صحيحة' });
  }

  if (decision === 'rejected' && (!note || !note.trim())) {
    return res.status(400).json({ success: false, error: 'سبب الرفض مطلوب' });
  }

  try {
    await pool.query(
      `UPDATE product_vehicle_pricing SET approval_status = $1, admin_note = $2, updated_at = NOW() WHERE id = $3`,
      [decision, note || null, pricing_id]
    );
    res.json({ success: true, message: 'تم تحديث حالة السعر' });
    logAdminActivity(req.admin.admin_id, decision === 'approved' ? 'موافقة على سعر' : 'رفض سعر', 'pricing', pricing_id, note);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ سجل نشاط الأدمن (المحفوظات) ============

app.get('/api/admin/activity-log', checkAdminAuth, async (req, res) => {
  // السجل يخص الأدمن الرئيسي فقط (رقابة على كل الموظفين)
  if (req.admin.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'هذه الميزة للأدمن الرئيسي فقط' });
  }
  try {
    const result = await pool.query(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.note, al.created_at,
              p.full_name AS admin_name
       FROM admin_activity_log al
       JOIN profiles p ON p.id = al.admin_id
       ORDER BY al.created_at DESC
       LIMIT 300`
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ لوحة تحكم: كل الطلبات ============

app.get('/api/admin/orders', checkAdminAuth, requirePermission('can_manage_orders'), async (req, res) => {
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
});

// ============ نظام SMS Gateway عبر Polling ============

const SMS_GATEWAY_SECRET = process.env.SMS_GATEWAY_SECRET;

function checkGatewaySecret(req, res, next) {
  if (req.headers['x-gateway-secret'] !== SMS_GATEWAY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/sms/pending', checkGatewaySecret, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, phone, message FROM sms_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5`
    );
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/sms/confirm', checkGatewaySecret, async (req, res) => {
  const { id, status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ error: 'Missing id or status' });
  }

  try {
    await pool.query(
      `UPDATE sms_queue SET status = $1, sent_at = NOW() WHERE id = $2`,
      [status, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================================

app.listen(port, () => console.log(`Server running on port ${port}`));
