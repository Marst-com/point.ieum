const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requirePerm } = require('../middleware/auth');
const chatService = require('../services/chatService');
const realtime = require('../realtime');

router.use(requirePerm('chat'));

router.get('/rooms', asyncHandler(async (req, res) => res.json({ items: await chatService.listRooms(req.user.id) })));
router.get('/search', asyncHandler(async (req, res) => {
  res.json({ items: await chatService.searchMessages(req.user.id, String(req.query.q || '')) });
}));
router.post('/dm', asyncHandler(async (req, res) => {
  res.json({ room: await chatService.openDm(req.user.id, (req.body || {}).username) });
}));
router.post('/groups', asyncHandler(async (req, res) => {
  res.status(201).json({ room: await chatService.createGroup(req.user.id, req.body || {}) });
}));
router.post('/rooms/:id/members', asyncHandler(async (req, res) => {
  res.json({ room: await chatService.addMembers(req.user.id, req.params.id, (req.body || {}).usernames) });
}));
router.post('/rooms/:id/leave', asyncHandler(async (req, res) => {
  await chatService.leave(req.user.id, req.params.id);
  res.json({ ok: true });
}));
router.get('/rooms/:id/messages', asyncHandler(async (req, res) => {
  res.json({ items: await chatService.history(req.user.id, req.params.id) });
}));
// 소켓이 끊겼을 때를 위한 REST 백업 경로
router.post('/rooms/:id/messages', asyncHandler(async (req, res) => {
  const msg = await chatService.send(req.user.id, req.params.id, (req.body || {}).text);
  realtime.broadcastMessage(msg);
  res.status(201).json({ message: msg });
}));

module.exports = router;
