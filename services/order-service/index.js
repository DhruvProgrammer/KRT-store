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
  try {
    const { items, total, shippingAddress, paymentIntentId } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    if (total == null || total < 0) {
      return res.status(400).json({ error: 'Total amount is required' });
    }

    const order = {
      id: getNextOrderId(),
      userId: req.userId,
      items: items.map(item => ({
        slug: item.slug,
        name: item.name || item.slug,
        price: Number(item.price),
        quantity: Number(item.quantity || 1),
        subtotal: Number(item.price) * Number(item.quantity || 1)
      })),
      total: Number(total),
      shippingAddress: shippingAddress || {},
      paymentIntentId: paymentIntentId || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Recalculate total from items for safety
    order.total = order.items.reduce((sum, item) => sum + item.subtotal, 0);

    orders.push(order);
    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET / - List orders for user
app.get('/', ensureUserId, (req, res) => {
  try {
    const userOrders = orders.filter(o => o.userId === req.userId);
    res.json({ orders: userOrders });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /:id - Get single order
app.get('/:id', ensureUserId, (req, res) => {
  try {
    const { id } = req.params;
    const order = orders.find(o => o.id === id && o.userId === req.userId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
