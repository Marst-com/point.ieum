const rateLimit = require('express-rate-limit');
const config = require('../config');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    skip: () => config.isTest,
    message: { error: { code: 'rate_limited', message } },
  });

module.exports = {
  api: make(60_000, 600, '요청이 너무 많아요. 잠시 뒤에 다시 해 주세요'),
  auth: make(15 * 60_000, 40, '로그인 시도가 너무 많아요. 15분 뒤에 다시 해 주세요'),
};
