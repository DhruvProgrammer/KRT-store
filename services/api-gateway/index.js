const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// CORS must be applied to ALL responses including proxy errors.
// Without this, if the backend is down the browser gets a 502 with no
// CORS headers and throws "Failed to fetch" instead of showing the real error.
const corsOptions = { origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] };
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // explicit preflight for all routes

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
      pathRewrite: {
        [`^${config.path}`]: ''
      },
      onError: (err, req, res) => {
        console.error(`[Gateway] ❌ Proxy error for ${name}:`, err.message);
        // Always set CORS headers on error so the browser can read the response
        res.setHeader('Access-Control-Allow-Origin', '*');
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
