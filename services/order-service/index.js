const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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
  const { items, shippingAddress, paymentIntentId } = req.body;
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
    paymentIntentId: paymentIntentId || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.push(order);
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
