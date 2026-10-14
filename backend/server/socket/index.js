const { Server } = require('socket.io');
const realtime = require('../realtime');
const authService = require('../services/authService');
const chatService = require('../services/chatService');
const { HttpError } = require('../utils/errors');
const { isAllowedOrigin, isSameHost } = require('../middleware/cors');

const MAX_MESSAGES_PER_SECOND = 5;

function attachSocket(httpServer) {
  const io = new Server(httpServer, {
    // 브라우저용 CORS (HTTP 폴링). 허용한 프론트 주소만 통과.
    cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), methods: ['GET', 'POST'] },
    // 웹소켓은 브라우저가 CORS 를 검사하지 않으니 서버가 Origin 을 직접 본다 (Origin 이 없는 앱/서버 클라이언트는 통과)
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || isAllowedOrigin(origin) || isSameHost(origin, req.headers.host));
    },
  });
  realtime.setIo(io);

  io.use(async (socket, next) => {
    try {
      const user = await authService.userFromToken(socket.handshake.auth?.token);
      if (user.isAnonymous) return next(new Error('login_required'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('invalid_token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    try {
      for (const id of await chatService.roomIdsFor(user.id)) socket.join(`room:${id}`);
    } catch (e) { console.error('[socket] join rooms failed', e); }

    let count = 0;
    const timer = setInterval(() => { count = 0; }, 1000);
    socket.on('disconnect', () => clearInterval(timer));

    socket.on('chat:send', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (++count > MAX_MESSAGES_PER_SECOND) return reply({ ok: false, code: 'rate_limited', message: '너무 빨라요' });
      try {
        const msg = await chatService.send(user.id, data?.roomId, data?.text);
        realtime.broadcastMessage(msg);
        return reply({ ok: true, message: msg });
      } catch (e) {
        if (e instanceof HttpError) return reply({ ok: false, code: e.code, message: e.message });
        console.error('[socket] send failed', e);
        return reply({ ok: false, code: 'server_error', message: '보내지 못했어요' });
      }
    });
  });

  return io;
}

module.exports = { attachSocket };
