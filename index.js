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

// ============ إنشاء الحساب النهائي (مع دعم رفع وثائق المورّد) ============

app.post('/api/complete-registration', upload.fields([
  { name: 'commercial_register', maxCount: 1 },
  { name: 'payment_receipt', maxCount: 1 }
]), async (req, res) => {
  const { phone, full_name, role, username, password } = req.body;

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
    }

    res.json({ success: true, message: 'تم إنشاء الحساب بنجاح', profile_id: newId, verification_status: verificationStatus });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إنشاء الحساب: ' + err.message });
  }
});

// ============ تسجيل الدخول (مستخدمين عاديين) ============

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

    delete profile.password_hash;

    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', profile });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل تسجيل الدخول: ' + err.message });
  }
});

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

// ============ إعداد أول حساب أدمن (مؤقت - يُحذف بعد الاستخدام مرة واحدة) ============

app.post('/api/setup-first-admin', async (req, res) => {
  const { setup_key, username, password, full_name } = req.body;

  if (setup_key !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const existingAdmin = await pool.query(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1`);
    if (existingAdmin.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'يوجد أدمن بالفعل' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone: '+213000000000',
      phone_confirm: true
    });

    if (authError) {
      return res.status(500).json({ success: false, error: authError.message });
    }

    const newId = authData.user.id;
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO profiles (id, role, full_name, username, password_hash, is_active, verification_status, created_at, updated_at)
       VALUES ($1, 'admin', $2, $3, $4, true, 'approved', NOW(), NOW())`,
      [newId, full_name, username, passwordHash]
    );

    res.json({ success: true, message: 'تم إنشاء حساب الأدمن' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ نظام جلسات الأدمن/الموظفين ============

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

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

    res.json({ success: true, message: 'تم تحديث حالة الطلب' });

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
