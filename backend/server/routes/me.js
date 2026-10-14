const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requirePerm } = require('../middleware/auth');
const userService = require('../services/userService');
const pointService = require('../services/pointService');
const workService = require('../services/workService');

router.get('/', asyncHandler(async (req, res) => {
  // 로그인한 사용자는 최신 정보를 이미 req.user 로 읽어왔다
  res.json({ user: userService.toMe(req.user) });
}));

router.get('/points', requirePerm('points.view'), asyncHandler(async (req, res) => {
  res.json({ items: await pointService.history(req.user.id) });
}));

router.get('/grade', requirePerm('grade.view'), asyncHandler(async (req, res) => {
  res.json(await workService.myStats(req.user.id));
}));

module.exports = router;
