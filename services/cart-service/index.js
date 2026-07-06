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
  try {
    const cart = getCart(req.userId);
    res.json({ cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve cart' });
  }
});

// POST /items - Add item to cart
app.post('/items', ensureUserId, (req, res) => {
  try {
    const { slug, name, price, quantity, image } = req.body;
    if (!slug || price == null || !quantity || quantity < 1) {
      return res.status(400).json({ error: 'slug, price, and quantity are required' });
    }

    const cart = getCart(req.userId);
    const existing = cart.items.find(item => item.slug === slug);

    if (existing) {
      existing.quantity += Number(quantity);
      existing.subtotal = existing.price * existing.quantity;
    } else {
      cart.items.push({
        slug,
        name: name || slug,
        price: Number(price),
        quantity: Number(quantity),
        image: image || '',
        subtotal: Number(price) * Number(quantity)
      });
    }

    cart.updatedAt = new Date().toISOString();
    res.status(201).json({ cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// PUT /items/:slug - Update quantity
app.put('/items/:slug', ensureUserId, (req, res) => {
  try {
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
    item.subtotal = item.price * item.quantity;
    cart.updatedAt = new Date().toISOString();

    res.json({ cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item quantity' });
  }
});

// DELETE /items/:slug - Remove item
app.delete('/items/:slug', ensureUserId, (req, res) => {
  try {
    const { slug } = req.params;
    const cart = getCart(req.userId);
    cart.items = cart.items.filter(i => i.slug !== slug);
    cart.updatedAt = new Date().toISOString();
    res.json({ cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// DELETE / - Clear cart
app.delete('/', ensureUserId, (req, res) => {
  try {
    const cart = getCart(req.userId);
    cart.items = [];
    cart.updatedAt = new Date().toISOString();
    res.json({ cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`Cart Service running on port ${PORT}`));
