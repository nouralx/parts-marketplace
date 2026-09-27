const express = require('express');
const { checkUserAuth } = require('../middleware/auth');
const orders = require('../controllers/orders.controller');

const router = express.Router();

router.post('/orders', checkUserAuth, orders.createOrder);
router.get('/buyer/orders', checkUserAuth, orders.getBuyerOrders);

module.exports = router;
