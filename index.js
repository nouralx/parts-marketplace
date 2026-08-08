const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const agent = new SocksProxyAgent('socks5h://localhost:1055');

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

// ============ إنشاء الحساب النهائي ============

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.post('/api/complete-registration', async (req, res) => {
  const { phone, full_name, role } = req.body;

  if (!phone || !full_name || !role) {
    return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
  }

  if (role !== 'buyer' && role !== 'supplier') {
    return res.status(400).json({ success: false, error: 'نوع الحساب غير صحيح' });
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

    const existingProfile = await pool.query(
      `SELECT id FROM profiles WHERE phone = $1`,
      [phone]
    );

    if (existingProfile.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'يوجد حساب مسجل بهذا الرقم مسبقاً' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone: '+' + phone,
      phone_confirm: true
    });

    if (authError) {
      return res.status(500).json({ success: false, error: 'فشل إنشاء حساب المصادقة: ' + authError.message });
    }

    const newId = authData.user.id;

    await pool.query(
      `INSERT INTO profiles (id, role, full_name, phone, is_phone_verified, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())`,
      [newId, role, full_name, phone]
    );

    res.json({ success: true, message: 'تم إنشاء الحساب بنجاح', profile_id: newId });

  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل إنشاء الحساب: ' + err.message });
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
