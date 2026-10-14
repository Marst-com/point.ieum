const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { auth: authLimiter } = require('../middleware/rateLimit');

router.use(authLimiter);
router.post('/register', asyncHandler(async (req, res) => res.status(201).json(await authService.register(req.body || {}))));
router.post('/login', asyncHandler(async (req, res) => res.json(await authService.login(req.body || {}))));
router.post('/guest', (req, res) => res.json(authService.guest()));

module.exports = router;
