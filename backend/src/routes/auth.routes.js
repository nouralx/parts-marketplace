const express = require('express');
const upload = require('../middleware/upload');
const auth = require('../controllers/auth.controller');

const router = express.Router();

router.get('/check-username', auth.checkUsername);
router.post('/send-otp', auth.sendOtp);
router.post('/verify-otp', auth.verifyOtp);
router.post(
  '/complete-registration',
  upload.fields([
    { name: 'commercial_register', maxCount: 1 },
    { name: 'payment_receipt', maxCount: 1 },
  ]),
  auth.completeRegistration
);
router.post('/login', auth.login);
router.post('/reset-password', auth.resetPassword);
router.post('/admin/login', auth.adminLogin);

module.exports = router;
