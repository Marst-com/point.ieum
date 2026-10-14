const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.use('/auth', require('./auth'));
router.use('/external', require('./external')); // 로그인 토큰이 필요 없는 구간

router.use(authenticate); // 여기부터는 로그인(또는 익명) 필요
router.use('/me', require('./me'));
router.use('/work', require('./work'));
router.use('/shop', require('./shop'));
router.use('/friends', require('./friends'));
router.use('/chat', require('./chat'));
router.use('/admin', require('./admin'));

module.exports = router;
