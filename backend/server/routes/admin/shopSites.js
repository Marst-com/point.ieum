const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requirePerm } = require('../../middleware/auth');
const shopService = require('../../services/shopService');

router.use(requirePerm('shop.manage'));

router.get('/shop/sites', asyncHandler(async (req, res) => res.json({ items: await shopService.listAllForManager() })));
router.post('/shop/sites', asyncHandler(async (req, res) => res.status(201).json({ site: await shopService.createSite(req.body || {}) })));
router.patch('/shop/sites/:id', asyncHandler(async (req, res) => res.json({ site: await shopService.updateSite(req.params.id, req.body || {}) })));
router.delete('/shop/sites/:id', asyncHandler(async (req, res) => res.json({ site: await shopService.removeSite(req.params.id) })));

module.exports = router;
