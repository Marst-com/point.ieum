const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requirePerm } = require('../../middleware/auth');
const workService = require('../../services/workService');

router.get('/work', requirePerm('work.view'), asyncHandler(async (req, res) => {
  res.json({ items: await workService.ranking({ search: String(req.query.search || '') }) });
}));

module.exports = router;
