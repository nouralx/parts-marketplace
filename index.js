const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

const SMS_GATEWAY_URL = 'http://100.118.3.62:8080';

app.post('/api/send-otp', async (req, res) => {
  const { phone, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف أو الرسالة مفقودة' });
  }

  try {
    const url = `${SMS_GATEWAY_URL}/send?to=${encodeURIComponent(to)}&msg=${encodeURIComponent(message)}`;
    const response = await fetch(url);
    const text = await response.text();

    if (text.includes('SMS SENT')) {
      res.json({ success: true, message: 'تم إرسال الرسالة بنجاح' });
    } else {
      res.status(500).json({ success: false, error: text });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: 'فشل الاتصال ببوابة SMS: ' + err.message });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
