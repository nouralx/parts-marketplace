/**
 * Route aggregator.
 * NOTE: all sub-routers use flat legacy paths (/api/login, /api/catalog/:id,
 * /api/supplier/listings, ...) to stay compatible with the existing frontend.
 * admin routes will be added in a later phase.
 */

const express = require('express');
const authRoutes = require('./auth.routes');
const catalogRoutes = require('./catalog.routes');
const supplierRoutes = require('./supplier.routes');
const ordersRoutes = require('./orders.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

router.use('/', authRoutes);
router.use('/', catalogRoutes);
router.use('/', supplierRoutes);
router.use('/', ordersRoutes);
router.use('/', adminRoutes);

router.get('/', (req, res) => {
  res.json({ success: true, message: 'API شغالة' });
});

module.exports = router;
