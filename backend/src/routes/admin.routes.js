const express = require('express');
const { checkAdminAuth, requirePermission } = require('../middleware/auth');
const adminUsers = require('../controllers/admin-users.controller');
const adminCatalog = require('../controllers/admin-catalog.controller');

const router = express.Router();

// Every /api/admin/* route requires a valid admin/staff session.
router.use('/admin', checkAdminAuth);

// Supplier verification
router.get('/admin/supplier-requests', requirePermission('can_review_suppliers'), adminUsers.getSupplierRequests);
router.get('/admin/document-url', requirePermission('can_review_suppliers'), adminUsers.getDocumentUrl);
router.post('/admin/review-supplier', requirePermission('can_review_suppliers'), adminUsers.reviewSupplier);

// User management
router.get('/admin/users', requirePermission('can_manage_users'), adminUsers.getUsers);
router.post('/admin/toggle-user-status', requirePermission('can_manage_users'), adminUsers.toggleUserStatus);
router.get('/admin/user-detail/:id', requirePermission('can_manage_users'), adminUsers.getUserDetail);
router.delete('/admin/users/:id', requirePermission('can_manage_users'), adminUsers.deleteUser);

// Product & pricing review
router.get('/admin/pending-products', requirePermission('can_manage_products'), adminCatalog.getPendingProducts);
router.get('/admin/all-approved-products', requirePermission('can_manage_products'), adminCatalog.getAllApprovedProducts);
router.get('/admin/product-suppliers/:productId', requirePermission('can_manage_products'), adminCatalog.getProductSuppliers);
router.post('/admin/review-product', requirePermission('can_manage_products'), adminCatalog.reviewProduct);
router.get('/admin/pending-pricing', requirePermission('can_manage_products'), adminCatalog.getPendingPricing);
router.post('/admin/review-pricing', requirePermission('can_manage_products'), adminCatalog.reviewPricing);

// Product deletion (two legacy endpoints, kept both for frontend compatibility)
router.delete('/admin/products/:id', requirePermission('can_delete_products'), adminCatalog.deleteProductSimple);
router.delete('/admin/delete-product/:id', requirePermission('can_delete_products'), adminCatalog.deleteProductThorough);
router.post('/admin/delete-products-bulk', requirePermission('can_delete_products'), adminCatalog.deleteProductsBulk);

// Activity log (main admin only — enforced inside the controllers)
router.get('/admin/activity-log', adminCatalog.getActivityLog);
router.delete('/admin/activity-log', adminCatalog.deleteActivityLog);

// Orders oversight
router.get('/admin/orders', requirePermission('can_manage_orders'), adminCatalog.getAdminOrders);

module.exports = router;
