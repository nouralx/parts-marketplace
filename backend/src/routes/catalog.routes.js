const express = require('express');
const { checkUserAuth, optionalUserAuth } = require('../middleware/auth');
const catalog = require('../controllers/catalog.controller');

const router = express.Router();

router.get('/vehicles', catalog.getVehicles);
router.post('/vehicles', checkUserAuth, catalog.createVehicle);

// NOTE: /search must be registered before /:id so it isn't swallowed by it.
router.get('/catalog/search', optionalUserAuth, catalog.searchCatalog);
router.get('/catalog/:id', optionalUserAuth, catalog.getCatalogDetail);

module.exports = router;
