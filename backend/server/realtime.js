// socket.io 인스턴스를 서비스들이 직접 import 하지 않고 이 얇은 모듈로만 접근한다.
let io = null;

module.exports = {
  setIo(instance) { io = instance; },
  broadcastMessage(msg) {
    io?.to(`room:${msg.roomId}`).emit('chat:message', msg);
  },
  roomChanged(roomId, memberIds) {
    if (!io) return;
    for (const id of memberIds) {
      io.in(`user:${id}`).socketsJoin(`room:${roomId}`);
      io.to(`user:${id}`).emit('chat:rooms-changed', { roomId });
    }
  },
  roomLeft(roomId, uid) {
    io?.in(`user:${uid}`).socketsLeave(`room:${roomId}`);
    io?.to(`user:${uid}`).emit('chat:rooms-changed', { roomId });
  },
  toUser(uid, event, payload = {}) {
    io?.to(`user:${uid}`).emit(event, payload);
  },
};
