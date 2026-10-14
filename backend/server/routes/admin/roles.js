const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requirePerm } = require('../../middleware/auth');
const userSearch = require('../../services/userSearch');
const userService = require('../../services/userService');

router.use(requirePerm('roles.manage'));

router.get('/roles', asyncHandler(async (req, res) => {
  res.json({ items: await userSearch.forRoleManagement(String(req.query.q || '')) });
}));
router.patch('/roles/:id', asyncHandler(async (req, res) => {
  res.json({ user: await userService.setRole(req.params.id, (req.body || {}).role, req.user.id) });
}));

module.exports = router;
