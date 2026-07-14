const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ponytail: fire-and-forget email receipt via the Python notification service.
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8000';
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN || '';
const STORE_NAME = process.env.STORE_NAME || 'KRT Store';

function notifyCustomer(order) {
  if (!order.email) return;
  const payload = {
    email: order.email,
    order_id: order.id,
    items: order.items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
    total: order.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    store_name: STORE_NAME,
    created_at: order.createdAt
  };
  fetch(`${NOTIFICATION_SERVICE_URL}/notify/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-notify-token': NOTIFY_TOKEN },
    body: JSON.stringify(payload)
  }).catch(err => console.error('[order] notify failed:', err.message));
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
app.post('/', ensureUserId, (req, res) => {
  const { items, shippingAddress, paymentIntentId, email } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
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
