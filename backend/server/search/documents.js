// 서비스 데이터 → 검색 색인 문서. 색인에 들어가는 모양은 전부 여기서만 정한다.
const { gradeFor, gradeRank } = require('../services/gradeService');

const publicData = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

const userDoc = (u) => ({
  text: { name: u.name, username: u.username },
  num: {
    friendCount: u.friendCount || 0,
    gradeRank: gradeRank(gradeFor(u.stones || 0)),
    stones: u.stones || 0,
    createdAt: u.createdAt || 0,
  },
  data: publicData(u),
});

const workerDoc = (u) => ({
  text: { name: u.name, username: u.username },
  num: { stones: u.stones || 0 },
  data: publicData(u),
});

const siteDoc = (s) => ({
  text: { name: s.name, description: s.description || '' },
  num: { price: s.price || 0, createdAt: s.createdAt || 0 },
  filter: { active: s.active ? '1' : '0' },
  data: { id: s.id },
});

const messageDoc = (m) => ({
  text: { text: m.text },
  num: { createdAt: m.createdAt },
  filter: { roomId: m.roomId },
  data: { id: m.id, roomId: m.roomId, senderId: m.senderId, senderName: m.senderName, text: m.text, createdAt: m.createdAt },
});

module.exports = { userDoc, workerDoc, siteDoc, messageDoc };
