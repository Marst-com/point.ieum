// 상점에 등록된 외부 사이트의 백엔드가 호출하는 API (로그인 토큰 없이 siteKey 로 인증)
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const shopService = require('../services/shopService');

router.post('/verify', asyncHandler(async (req, res) => {
  res.json(await shopService.verifyEntry(req.body || {}));
}));

// 읽기 전용 조회 (siteKey 로 인증). 쓰기는 없다.
router.post('/account', asyncHandler(async (req, res) => {
  res.json(await shopService.externalAccount(req.body || {}));
}));
router.post('/ticket', asyncHandler(async (req, res) => {
  res.json(await shopService.externalTicket(req.body || {}));
}));

module.exports = router;
