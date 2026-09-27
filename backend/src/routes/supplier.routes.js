const express = require('express');
const { checkUserAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const supplier = require('../controllers/supplier.controller');
const orders = require('../controllers/orders.controller');

const router = express.Router();

router.use('/supplier', checkUserAuth);

router.post('/supplier/propose-product', upload.array('images', 6), supplier.proposeProduct);
router.get('/supplier/listings', supplier.getListings);
router.post('/supplier/listings', supplier.createListing);
router.post('/supplier/listings/:id/price', supplier.updateListingPrice);
router.post('/supplier/listings/:id/availability', supplier.updateListingAvailability);
router.delete('/supplier/listings/:id', supplier.deleteListing);
router.get('/supplier/proposed-products', supplier.getProposedProducts);
router.delete('/supplier/proposed-products/:id', supplier.deleteProposedProduct);

router.get('/supplier/orders', orders.getSupplierOrderItems);
router.post('/supplier/orders/:item_id/status', orders.updateOrderItemStatus);

module.exports = router;
