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
      onError: (err, req, res) => {
        console.error(`[Gateway] ❌ Proxy error for ${name}:`, err.message);
        // Always set CORS headers on error so the browser can read the response
        const origin = req.headers.origin;
        if (origin && ALLOWED_ORIGINS.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.status(502).json({ error: `Service ${name} unavailable`, detail: err.message });
      },
      onProxyReq: (proxyReq, req) => {
        console.log(`[Gateway] → ${req.method} ${req.path} → ${name} (${config.target})`);
      },
      onProxyRes: (proxyRes, req) => {
        console.log(`[Gateway] ← ${req.method} ${req.path} ← ${name} status:${proxyRes.statusCode}`);
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
