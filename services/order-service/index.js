const express = require('express');
const cors = require('cors');
const path = require('path');
// ponytail: load NOTIFY_TOKEN/STORE_NAME from the notification service's .env
// (single source of truth) so order-service works even when not launched via
// the .ps1 injector. Dotenv won't override vars already in process.env (docker injects them).
require('dotenv').config({ path: path.join(__dirname, '../notification-service/.env') });

const app = express();
app.use(cors());
app.use(express.json());

// ponytail: fire-and-forget email receipt via the Python notification service.
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8000';
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN || '';
const STORE_NAME = process.env.STORE_NAME || 'KRT Store';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3002';

// ponytail: checkout requires a verified email OTP. Verified server-side here
// (not trusted from the client) by asking auth-service to consume the code.
async function verifyCheckoutOtp(email, otp) {
  if (!email || !otp) return false;
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, purpose: 'checkout' })
    });
    return res.ok;
  } catch (err) {
    console.error('[order-service] OTP verify call failed:', err.message);
    return false;
  }
}

async function notifyCustomer(order) {
  console.log('[order-service] notifyCustomer triggered for order:', order.id, 'email:', order.email);
  if (!order.email) {
    console.log('[order-service] Skipping notification: No email address provided in order.');
    return;
  }
  const payload = {
    email: order.email,
    order_id: order.id,
    items: order.items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
    total: order.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    store_name: STORE_NAME,
    created_at: order.createdAt
  };
  console.log('[order-service] Calling notification-service with payload:', JSON.stringify(payload));
  try {
    const res = await fetch(`${NOTIFICATION_SERVICE_URL}/notify/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notify-token': NOTIFY_TOKEN },
      body: JSON.stringify(payload)
    });
    const body = await res.text();
    if (res.ok) {
      console.log('[order-service] ✅ Email sent successfully. Response:', body);
    } else {
      console.error('[order-service] ❌ notification-service returned error:', res.status, body);
    }
  } catch (err) {
    console.error('[order-service] ❌ try-catch: fetch to notification-service threw an exception:', err.message);
    console.error('[order-service]    Full error:', err);
  }
}

// In-memory array for orders
let orders = [];
let nextOrderId = 1;

function getNextOrderId() {
  return String(nextOrderId++);
}

function ensureUserId(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'x-user-id header required' });
  }
  req.userId = userId;
  next();
}

// POST / - Create order
app.post('/', ensureUserId, async (req, res) => {
  console.log('[order-service] POST / received request. Body:', JSON.stringify(req.body));
  const { items, shippingAddress, paymentIntentId, email, otp } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.log('[order-service] Invalid request: items array is required/empty');
    return res.status(400).json({ error: 'Items array is required' });
  }

  // Require a verified email OTP before accepting the order.
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and verification code are required' });
  }
  const otpOk = await verifyCheckoutOtp(email, otp);
  if (!otpOk) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  const order = {
    id: getNextOrderId(),
    userId: req.userId,
    items: items.map(item => ({
      slug: item.slug,
      name: item.name || item.slug,
      price: Number(item.price),
      quantity: Number(item.quantity || 1)
    })),
    shippingAddress: shippingAddress || {},
    email: email || null,
    paymentIntentId: paymentIntentId || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.push(order);
  notifyCustomer(order);
  res.status(201).json({ order });
});

// GET / - List orders for user
app.get('/', ensureUserId, (req, res) => {
  res.json({ orders: orders.filter(o => o.userId === req.userId) });
});

// GET /:id - Get single order
app.get('/:id', ensureUserId, (req, res) => {
  const order = orders.find(o => o.id === req.params.id && o.userId === req.userId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
