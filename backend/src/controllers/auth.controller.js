/**
 * Auth Controller
 * Username check, OTP flow, registration, login, password reset, admin login.
 * Behavior ported 1:1 from the original monolithic index.js.
 */

const bcrypt = require('bcryptjs');
const { pool, supabaseAdmin } = require('../config/db');
const config = require('../config/environment');
const { generateToken } = require('../services/token.service');
const { isIpRateLimited, generateOtpCode, getClientIp } = require('../services/otp.service');

// GET /api/check-username
async function checkUsername(req, res) {
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
}

// POST /api/send-otp
async function sendOtp(req, res) {
  const { phone, purpose } = req.body;

  if (!phone || !purpose) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف أو الغرض مفقود' });
  }

  const clientIp = getClientIp(req);
  if (isIpRateLimited(clientIp)) {
    return res.status(429).json({ success: false, error: 'عدد كبير من المحاولات من هذا الجهاز، حاول بعد 15 دقيقة' });
  }

  try {
    const recentCheck = await pool.query(
      `SELECT created_at FROM otp_verifications WHERE phone = $1 ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );

    if (recentCheck.rows.length > 0) {
      const lastCreated = new Date(recentCheck.rows[0].created_at);
      const secondsSince = (Date.now() - lastCreated.getTime()) / 1000;
      if (secondsSince < config.otp.resendCooldownSeconds) {
        const waitTime = Math.ceil(config.otp.resendCooldownSeconds - secondsSince);
        return res.status(429).json({ success: false, error: `الرجاء الانتظار ${waitTime} ثانية قبل إعادة الإرسال` });
      }
    }

    const windowCheck = await pool.query(
      `SELECT COUNT(*) FROM otp_verifications WHERE phone = $1 AND created_at > NOW() - INTERVAL '${config.otp.windowHours} hours'`,
      [phone]
    );

    if (parseInt(windowCheck.rows[0].count, 10) >= config.otp.maxPerWindow) {
      return res.status(429).json({ success: false, error: `تم تجاوز الحد الأقصى للمحاولات لهذا الرقم، حاول بعد ${config.otp.windowHours} ساعات` });
    }

    const existingProfileCheck = await pool.query(`SELECT id FROM profiles WHERE phone = $1`, [phone]);
    const profileExists = existingProfileCheck.rows.length > 0;

    if ((purpose === 'login' || purpose === 'password_reset') && !profileExists) {
      return res.status(404).json({ success: false, error: 'لا يوجد حساب مسجل بهذا الرقم' });
    }

    if (purpose === 'registration' && profileExists) {
      return res.status(409).json({ success: false, error: 'يوجد حساب مسجل بهذا الرقم مسبقاً', already_registered: true });
    }

    const otpCode = generateOtpCode();
    const expiresAt = new Date(Date.now() + config.otp.codeExpiryMinutes * 60 * 1000);

    await pool.query(
      `INSERT INTO otp_verifications (phone, otp_code, purpose, expires_at, attempts, is_verified)
       VALUES ($1, $2, $3, $4, 0, false)`,
      [phone, otpCode, purpose, expiresAt]
    );

    const message = `رمز التحقق الخاص بك هو: ${otpCode}`;
    await pool.query(`INSERT INTO sms_queue (phone, message) VALUES ($1, $2)`, [phone, message]);

    res.json({ success: true, message: 'تم إرسال رمز التحقق' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إرسال رمز التحقق: ' + err.message });
  }
}

// POST /api/verify-otp
async function verifyOtp(req, res) {
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

    await pool.query(`UPDATE otp_verifications SET is_verified = true WHERE id = $1`, [record.id]);

    res.json({ success: true, message: 'تم التحقق بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل التحقق: ' + err.message });
  }
}

// POST /api/complete-registration (multipart: commercial_register, payment_receipt for suppliers)
async function completeRegistration(req, res) {
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
      `SELECT id FROM otp_verifications WHERE phone = $1 AND is_verified = true ORDER BY created_at DESC LIMIT 1`,
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
      phone_confirm: true,
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
}

// POST /api/login
async function login(req, res) {
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
    const expiresAt = new Date(Date.now() + config.sessions.userExpiryDays * 24 * 60 * 60 * 1000);

    await pool.query(`INSERT INTO user_sessions (token, profile_id, expires_at) VALUES ($1, $2, $3)`, [
      token,
      profile.id,
      expiresAt,
    ]);

    delete profile.password_hash;

    res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', profile, token });
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل تسجيل الدخول: ' + err.message });
  }
}

// POST /api/reset-password
async function resetPassword(req, res) {
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
}

// POST /api/admin/login
async function adminLogin(req, res) {
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
    const expiresAt = new Date(Date.now() + config.sessions.adminExpiryHours * 60 * 60 * 1000);

    await pool.query(`INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, $3)`, [
      token,
      account.id,
      expiresAt,
    ]);

    res.json({ success: true, token, role: account.role, full_name: account.full_name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  checkUsername,
  sendOtp,
  verifyOtp,
  completeRegistration,
  login,
  resetPassword,
  adminLogin,
};
