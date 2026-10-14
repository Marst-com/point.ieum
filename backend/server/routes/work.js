const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requirePerm } = require('../middleware/auth');
const workService = require('../services/workService');

router.post('/mine', requirePerm('work.mine'), asyncHandler(async (req, res) => {
  res.json(await workService.mine(req.user.id, (req.body || {}).taps));
}));

module.exports = router;
