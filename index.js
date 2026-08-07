const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const agent = new SocksProxyAgent('socks5h://localhost:1055');

app.use(express.json());

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

// ============ نظام OTP الجديد (عبر sms_queue) ============

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/send-otp', async (req, res) => {
  const { phone, purpose } = req.body;

  if (!phone || !purpose) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف أو الغرض مفقود' });
  }

  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // صالح لمدة 5 دقائق

  try {
    // 1. تخزين رمز OTP في جدول otp_verifications
    await pool.query(
      `INSERT INTO otp_verifications (phone, otp_code, purpose, expires_at, attempts, is_verified)
       VALUES ($1, $2, $3, $4, 0, false)`,
      [phone, otpCode, purpose, expiresAt]
    );

    // 2. إدراج الرسالة في قائمة انتظار SMS
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
