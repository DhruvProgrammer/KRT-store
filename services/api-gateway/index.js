const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// CORS must be applied to ALL responses including proxy errors.
// Without this, if the backend is down the browser gets a 502 with no
// CORS headers and throws "Failed to fetch" instead of showing the real error.
// ponytail: ALLOWED_ORIGINS is a comma-separated allowlist. '*' is rejected
// at boot — wildcard CORS + Authorization header is the classic CSRF vector.
// Dev default permits the Astro dev server (:4321) and the gateway's own host.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:4321,http://127.0.0.1:4321')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (ALLOWED_ORIGINS.includes('*')) {
  console.error('[Gateway] ALLOWED_ORIGINS="*" is not permitted. Pin it to the real app origin(s).');
  process.exit(1);
}
const corsOptions = {
  origin: (origin, cb) => {
    // ponytail: no-origin (same-origin/server-to-server/curl) → allow.
    // false (not Error) so cors omits the header instead of 500-ing.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  credentials: true
};
app.use(cors(corsOptions));

// ponytail: no express.json() here — the gateway is a pure proxy. Parsing the
// body consumes the stream before createProxyMiddleware forwards it, so
// backends (e.g. order-service) get an empty body and receipts never send.
// Service targets
const services = {
  auth: { target: process.env.AUTH_SERVICE_URL || 'http://localhost:3002', path: '/api/auth' },
  catalog: { target: process.env.CATALOG_SERVICE_URL || 'http://localhost:3003', path: '/api/catalog' },
  cart: { target: process.env.CART_SERVICE_URL || 'http://localhost:3004', path: '/api/cart' },
  orders: { target: process.env.ORDER_SERVICE_URL || 'http://localhost:3005', path: '/api/orders' },
  payments: { target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006', path: '/api/payments' },
  // ponytail: notification route is /notify/order, so keep the /notify segment in the target.
  notify: { target: (process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8000') + '/notify', path: '/api/notify' }
};

// Proxy each service
Object.entries(services).forEach(([name, config]) => {
  app.use(
    config.path,
    createProxyMiddleware({
      target: config.target,
      changeOrigin: true,
      // ponytail: fail fast on a hung upstream instead of hanging the browser
      // until a 504. Auth itself bounds its mailer call to 8s, so this is a backstop.
      proxyTimeout: 12000,
      timeout: 12000,
      pathRewrite: {
        [`^${config.path}`]: ''
      },
      // ponytail: http-proxy-middleware v3 nests the event handlers under
      // `on`. The LEGACY top-level names (onProxyReq / onProxyRes / onError)
      // are silently IGNORED by createProxyMiddleware — only
      // legacyCreateProxyMiddleware maps them. The previous code used the
      // legacy names, so none of these handlers ever ran.
      on: {
        error: (err, req, res) => {
          console.error(`[Gateway] ❌ Proxy error for ${name}:`, err.message);
          // Always set CORS headers on error so the browser can read the response
          const origin = req.headers.origin;
          if (origin && ALLOWED_ORIGINS.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
          }
          res.status(502).json({ error: `Service ${name} unavailable` });
        },
        proxyReq: (proxyReq, req) => {
          console.log(`[Gateway] → ${req.method} ${req.path} → ${name} (${config.target})`);
          // ponytail: the gateway is the ONLY hop that may set the forwarded
          // client IP. A client-supplied X-Forwarded-For would otherwise reach
          // the auth service verbatim, and since the auth service trusts one
          // proxy hop, an attacker could mint a fresh rate-limit bucket per
          // request and defeat every limiter (and forge audit-log IPs).
          // Strip whatever the client sent and set it from the socket peer.
          proxyReq.removeHeader('x-forwarded-for');
          proxyReq.removeHeader('x-real-ip');
          proxyReq.removeHeader('forwarded');
          const peer = req.socket && req.socket.remoteAddress;
          if (peer) proxyReq.setHeader('x-forwarded-for', peer);
          proxyReq.setHeader('x-real-ip', peer || '');
        },
        proxyRes: (proxyRes, req) => {
          console.log(`[Gateway] ← ${req.method} ${req.path} ← ${name} status:${proxyRes.statusCode}`);
          // ponytail: the gateway is the ONLY hop the browser talks to, so it
          // owns the CORS policy. The upstream services run a bare
          // `cors()` (no origin list), which answers
          // Access-Control-Allow-Origin: * -- and http-proxy copies the
          // upstream's headers onto the response, OVERWRITING the correct
          // header the gateway's own cors() middleware had just set.
          //
          // The browser then refuses the request: "the value of the
          // Access-Control-Allow-Origin header must not be the wildcard '*'
          // when the request's credentials mode is 'include'". Every
          // credentialed call through the gateway failed -- the order
          // placement (POST /api/orders) most visibly, but the cart and
          // catalog too.
          //
          // So: drop the upstream's CORS headers and re-apply the
          // gateway's own. Same allowlist, same credentials flag, and Vary
          // so a shared cache cannot serve one origin's header to another.
          // proxyRes.headers is a plain object, not a Map.
          delete proxyRes.headers['access-control-allow-origin'];
          delete proxyRes.headers['access-control-allow-credentials'];
          delete proxyRes.headers['access-control-allow-headers'];
          delete proxyRes.headers['access-control-allow-methods'];
          delete proxyRes.headers['access-control-max-age'];
          const origin = req.headers.origin;
          if (origin && ALLOWED_ORIGINS.includes(origin)) {
            proxyRes.headers['access-control-allow-origin'] = origin;
            proxyRes.headers['access-control-allow-credentials'] = 'true';
            proxyRes.headers['access-control-allow-headers'] =
              'Content-Type, Authorization, x-notify-token';
            proxyRes.headers['access-control-allow-methods'] =
              corsOptions.methods.join(',');
            proxyRes.headers['access-control-max-age'] = '600';
          }
          const vary = proxyRes.headers['vary'];
          proxyRes.headers['vary'] =
            !vary || /origin/i.test(vary) ? vary || 'Origin' : `${vary}, Origin`;
        }
      }
    })
  );
});

// GET /health - Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    gateway: 'active',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
