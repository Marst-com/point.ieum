const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { api: apiLimiter } = require('./middleware/rateLimit');
const { corsMiddleware } = require('./middleware/cors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);

  app.use(helmet({
    // 프론트가 다른 주소에 있으면 이 서버의 응답을 다른 사이트가 읽을 수 있어야 한다(CORS 로 허용한 곳만)
    crossOriginResourcePolicy: { policy: config.corsOrigins.length ? 'cross-origin' : 'same-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'upgrade-insecure-requests': null,
      },
    },
  }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true })); // 호스팅의 헬스체크용
  app.use('/api', corsMiddleware, apiLimiter, routes);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: '없는 주소예요' } }));

  if (config.serveFrontend) app.use(express.static(config.frontendDir));
  else app.get('/', (req, res) => res.json({ name: 'IEUM PointSystem API', ok: true }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
