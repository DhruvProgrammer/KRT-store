const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// userId -> cart object { userId, items[], createdAt, updatedAt }
const carts = new Map();

function getCart(userId) {
  if (!carts.has(userId)) {
    carts.set(userId, { userId, items: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  return carts.get(userId);
}

function ensureUserId(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'x-user-id header required' });
  }
  req.userId = userId;
  next();
}

// GET / - Get cart for user (header x-user-id)
app.get('/', ensureUserId, (req, res) => {
  res.json({ cart: getCart(req.userId) });
});

// POST /items - Add item to cart
app.post('/items', ensureUserId, (req, res) => {
  const { slug, name, price, quantity, image } = req.body;
  if (!slug || price == null || !quantity || quantity < 1) {
    return res.status(400).json({ error: 'slug, price, and quantity are required' });
  }

  const cart = getCart(req.userId);
  const existing = cart.items.find(item => item.slug === slug);

  if (existing) {
    existing.quantity += Number(quantity);
  } else {
    cart.items.push({
      slug,
      name: name || slug,
      price: Number(price),
      quantity: Number(quantity),
      image: image || ''
    });
  }

  cart.updatedAt = new Date().toISOString();
  res.status(201).json({ cart });
});

// PUT /items/:slug - Update quantity
app.put('/items/:slug', ensureUserId, (req, res) => {
  const { slug } = req.params;
  const { quantity } = req.body;
  const cart = getCart(req.userId);
  const item = cart.items.find(i => i.slug === slug);

  if (!item) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }
  if (quantity == null || quantity < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1' });
  }

  item.quantity = Number(quantity);
  cart.updatedAt = new Date().toISOString();
  res.json({ cart });
});

// DELETE /items/:slug - Remove item
app.delete('/items/:slug', ensureUserId, (req, res) => {
  const cart = getCart(req.userId);
  cart.items = cart.items.filter(i => i.slug !== req.params.slug);
  cart.updatedAt = new Date().toISOString();
  res.json({ cart });
});

// DELETE / - Clear cart
app.delete('/', ensureUserId, (req, res) => {
  const cart = getCart(req.userId);
  cart.items = [];
  cart.updatedAt = new Date().toISOString();
  res.json({ cart });
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`Cart Service running on port ${PORT}`));
