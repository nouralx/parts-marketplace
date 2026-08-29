/**
 * Main Routes Configuration
 * Combines all route modules
 */

const express = require('express');
const adminRoutes = require('./admin.routes');
const supplierRoutes = require('./supplier.routes');
const catalogRoutes = require('./catalog.routes');
const authRoutes = require('./auth.routes');

const router = express.Router();

/**
 * API Routes
 */

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Status check
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
router.use('/auth', authRoutes);

// Admin routes
router.use('/admin', adminRoutes);

// Supplier routes
router.use('/supplier', supplierRoutes);

// Catalog routes
router.use('/catalog', catalogRoutes);

module.exports = router;
