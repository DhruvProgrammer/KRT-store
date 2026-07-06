const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Service targets
const services = {
  auth: { target: process.env.AUTH_SERVICE_URL || 'http://localhost:3002', path: '/api/auth' },
  catalog: { target: process.env.CATALOG_SERVICE_URL || 'http://localhost:3003', path: '/api/catalog' },
  cart: { target: process.env.CART_SERVICE_URL || 'http://localhost:3004', path: '/api/cart' },
  orders: { target: process.env.ORDER_SERVICE_URL || 'http://localhost:3005', path: '/api/orders' },
  payments: { target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006', path: '/api/payments' }
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
        console.error(`[Gateway] Proxy error for ${name}:`, err.message);
        res.status(502).json({ error: `Service ${name} unavailable` });
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[Gateway] ${req.method} ${req.path} -> ${name}`);
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
