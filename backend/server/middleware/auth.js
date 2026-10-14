const authService = require('../services/authService');
const { can } = require('../permissions');
const { E } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw E.unauthorized('로그인이 필요해요', 'login_required');
  req.user = await authService.userFromToken(token);
  next();
});

// 권한이 없을 때: 익명이면 "로그인 필요(401)", 로그인한 사람이면 "권한 없음(403)"
const requirePerm = (perm) => (req, res, next) => {
  if (can(req.user, perm)) return next();
  return next(req.user.isAnonymous ? E.unauthorized('로그인하면 쓸 수 있어요') : E.forbidden());
};

module.exports = { authenticate, requirePerm };
