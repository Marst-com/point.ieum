const config = require('../config');
const db = require('../db');
const col = require('../db/collections');
const realtime = require('../realtime');
const { E } = require('../utils/errors');
const { str } = require('../utils/validate');
const { newId } = require('../utils/ids');
const userService = require('./userService');
const search = require('../search/client');
const indexer = require('../search/indexer');

const dmRoomId = (a, b) => `dm_${[a, b].sort().join('_')}`;
const preview = (text) => (text.length > 60 ? `${text.slice(0, 60)}…` : text);

async function roomView(room, viewerId) {
  const members = await userService.getManyPublic(room.members);
  let title = room.name;
  if (room.type === 'dm') {
    const other = members.find((m) => m.id !== viewerId) || members[0];
    title = other ? other.name : '알 수 없는 사용자';
  }
  return {
    id: room.id, type: room.type, title, members,
    lastMessage: room.lastMessage || null,
    lastMessageAt: room.lastMessageAt || room.createdAt,
  };
}

async function requireMemberRoom(roomId, uid) {
  const room = await db.get(col.ROOMS, roomId);
  if (!room) throw E.notFound('대화방을 찾을 수 없어요');
  if (!room.members.includes(uid)) throw E.forbidden('이 대화방의 멤버가 아니에요');
  return room;
}

async function listRooms(uid) {
  const rooms = await db.list(col.ROOMS, { where: [['members', 'array-contains', uid]] });
  rooms.sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt));
  return Promise.all(rooms.map((r) => roomView(r, uid)));
}

async function roomIdsFor(uid) {
  return (await db.list(col.ROOMS, { where: [['members', 'array-contains', uid]] })).map((r) => r.id);
}

async function openDm(uid, username) {
  const target = await userService.requireByUsername(username);
  if (target.id === uid) throw E.badRequest('나와는 대화할 수 없어요');
  const id = dmRoomId(uid, target.id);
  // 트랜잭션: 동시에 두 사람이 열어도 한 번만 만들고, 이미 있는 방(마지막 메시지 등)은 덮어쓰지 않는다
  const { room, created } = await db.transaction(async (tx) => {
    const existing = await tx.get(col.ROOMS, id);
    if (existing) return { room: existing, created: false };
    const data = { type: 'dm', members: [uid, target.id], createdAt: Date.now(), lastMessageAt: null, lastMessage: null };
    tx.set(col.ROOMS, id, data);
    return { room: { id, ...data }, created: true };
  });
  if (created) realtime.roomChanged(id, room.members);
  return roomView(room, uid);
}

async function createGroup(uid, { name, members }) {
  const title = str(name, { field: '단톡방 이름', max: config.limits.groupName });
  const usernames = Array.isArray(members) ? members : [];
  const users = await Promise.all(usernames.map((u) => userService.requireByUsername(u)));
  const ids = [...new Set([uid, ...users.map((u) => u.id)])];
  if (ids.length < 2) throw E.badRequest('함께할 친구를 한 명 이상 골라 주세요');
  if (ids.length > config.limits.groupMembers) throw E.badRequest(`단톡방은 최대 ${config.limits.groupMembers}명까지 만들 수 있어요`);
  const id = newId();
  const data = { type: 'group', name: title, members: ids, owner: uid, createdAt: Date.now(), lastMessageAt: null, lastMessage: null };
  await db.set(col.ROOMS, id, data);
  realtime.roomChanged(id, ids);
  return roomView({ id, ...data }, uid);
}

async function addMembers(uid, roomId, usernames) {
  const users = await Promise.all((Array.isArray(usernames) ? usernames : []).map((u) => userService.requireByUsername(u)));
  if (!users.length) throw E.badRequest('초대할 아이디를 입력해 주세요');
  const room = await db.transaction(async (tx) => {
    const r = await tx.get(col.ROOMS, roomId);
    if (!r) throw E.notFound('대화방을 찾을 수 없어요');
    if (!r.members.includes(uid)) throw E.forbidden('이 대화방의 멤버가 아니에요');
    if (r.type !== 'group') throw E.badRequest('단톡방에서만 초대할 수 있어요');
    const members = [...new Set([...r.members, ...users.map((u) => u.id)])];
    if (members.length > config.limits.groupMembers) throw E.badRequest(`단톡방은 최대 ${config.limits.groupMembers}명이에요`);
    tx.update(col.ROOMS, roomId, { members });
    return { ...r, members };
  });
  realtime.roomChanged(roomId, room.members);
  return roomView(room, uid);
}

async function leave(uid, roomId) {
  await db.transaction(async (tx) => {
    const room = await tx.get(col.ROOMS, roomId);
    if (!room) throw E.notFound('대화방을 찾을 수 없어요');
    if (!room.members.includes(uid)) throw E.forbidden('이 대화방의 멤버가 아니에요');
    if (room.type !== 'group') throw E.badRequest('1:1 대화방은 나갈 수 없어요');
    tx.update(col.ROOMS, roomId, { members: room.members.filter((m) => m !== uid) });
  });
  realtime.roomLeft(roomId, uid);
}

async function history(uid, roomId, limit = 50) {
  await requireMemberRoom(roomId, uid);
  const rows = await db.list(col.messages(roomId), { orderBy: 'createdAt', desc: true, limit });
  return rows.reverse().map((m) => ({ ...m, roomId }));
}

async function send(uid, roomId, text) {
  const body = str(text, { field: '메시지', max: config.limits.messageLength });
  const sender = await userService.getById(uid);
  const createdAt = Date.now();
  const id = newId();
  const data = { senderId: uid, senderName: sender.name, text: body, createdAt };
  await db.transaction(async (tx) => {
    const room = await tx.get(col.ROOMS, roomId);
    if (!room) throw E.notFound('대화방을 찾을 수 없어요');
    if (!room.members.includes(uid)) throw E.forbidden('이 대화방의 멤버가 아니에요');
    tx.set(col.messages(roomId), id, data);
    // 동시에 여러 메시지가 들어와도, 더 새로운 메시지가 "마지막 메시지"로 남는다 (옛 메시지가 덮어쓰지 못함)
    if ((room.lastMessageAt || 0) <= createdAt) {
      tx.update(col.ROOMS, roomId, { lastMessageAt: createdAt, lastMessage: { text: preview(body), senderName: sender.name, at: createdAt } });
    }
  });
  const message = { id, roomId, ...data };
  await indexer.indexMessage(message);
  return message;
}

// 내가 속한 대화방의 메시지만 검색한다. (멤버 확인은 방 목록으로 하고, 엔진에는 방 번호로 범위를 좁혀서 보낸다)
async function searchMessages(uid, q, limit = 30) {
  const query = String(q || '').trim();
  if (!query) return [];
  const rooms = await listRooms(uid);
  if (!rooms.length) return [];
  const titles = new Map(rooms.map((r) => [r.id, r.title]));
  const { hits } = await search.get().search({ index: 'messages', q: query, limit, tiered: true, boost: 'createdAt', filters: { roomId: [...titles.keys()] } });
  return hits.map((h) => ({ ...h.data, roomTitle: titles.get(h.data.roomId) }));
}

module.exports = { listRooms, roomIdsFor, openDm, createGroup, addMembers, leave, history, send, searchMessages };
