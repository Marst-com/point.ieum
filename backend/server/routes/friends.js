const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requirePerm } = require('../middleware/auth');
const friendService = require('../services/friendService');

router.use(requirePerm('friends'));

router.get('/', asyncHandler(async (req, res) => res.json({ items: await friendService.list(req.user.id) })));
router.get('/search', asyncHandler(async (req, res) => {
  res.json({ items: await friendService.search(req.user.id, String(req.query.q || '')) });
}));
router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ friend: await friendService.add(req.user.id, (req.body || {}).username) });
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  await friendService.remove(req.user.id, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
