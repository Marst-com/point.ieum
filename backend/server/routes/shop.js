const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requirePerm } = require('../middleware/auth');
const shopService = require('../services/shopService');

router.get('/sites', requirePerm('shop.view'), asyncHandler(async (req, res) => {
  res.json({ items: await shopService.listSites(req.user, { q: String(req.query.q || '') }) });
}));

router.post('/sites/:id/buy', requirePerm('shop.buy'), asyncHandler(async (req, res) => {
  res.json(await shopService.buy(req.user.id, req.params.id));
}));

// 익명이어도 호출 가능 — 결과(result)로 다음 행동을 알려준다
router.post('/sites/:id/enter', requirePerm('shop.view'), asyncHandler(async (req, res) => {
  res.json(await shopService.enter(req.user, req.params.id));
}));

module.exports = router;
