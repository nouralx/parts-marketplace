const express = require('express');
const { checkGatewaySecret } = require('../middleware/gateway');
const sms = require('../controllers/sms.controller');

const router = express.Router();

router.get('/pending', checkGatewaySecret, sms.getPendingSms);
router.post('/confirm', checkGatewaySecret, sms.confirmSms);

module.exports = router;
