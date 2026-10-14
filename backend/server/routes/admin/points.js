const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requirePerm } = require('../../middleware/auth');
const userSearch = require('../../services/userSearch');
const pointService = require('../../services/pointService');

router.use(requirePerm('points.grant'));

router.get('/points/search', asyncHandler(async (req, res) => {
  res.json({ items: await userSearch.forPointGrant(String(req.query.q || '')) });
}));
router.post('/points', asyncHandler(async (req, res) => {
  const { userId, delta, reason } = req.body || {};
  res.json(await pointService.grant({ userId, delta, reason, byId: req.user.id }));
}));

module.exports = router;
