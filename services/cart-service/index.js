const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3002';

// ponytail: Express 4 does NOT catch a rejected promise from an async
// handler — the rejection escapes as an unhandled rejection and kills the
// process. One wrapper instead of a try/catch in every handler.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ponytail: no cookie-parser dependency — the service only ever needs one
// cookie. Same helper as the order service.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ponytail: the same normalisation the order service uses, so
// "Alice@x.com" and "alice@x.com" are one owner.
function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// ponytail: the cart's owner is the SESSION, resolved server-side. The
// httpOnly krt_access cookie is forwarded to the auth service as a Bearer
// token (the auth service accepts either) and the auth service tells us
// who it belongs to.
//
// The cart used to be keyed on the x-user-id header, which the CLIENT
// chose: anybody could read, rewrite or delete another visitor's cart by
// changing one header. There is NO fallback to that header — or to any
// other client-asserted identity — because a fallback IS the vulnerability.
async function sessionEmail(req) {
  const token = readCookie(req, 'krt_access');
  if (!token) return null;
  try {
    const res = await fetch(`${AUTH_SERVICE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const body = await res.json();
    return normalizeEmail(body && body.email);
  } catch (err) {
    console.error('[cart-service] session lookup failed:', err.message);
    return null;
  }
}

// ponytail: ONE session check for every route. It lives in the middleware
// so a new route cannot forget it, and it runs BEFORE the body is parsed so
// an unauthenticated caller cannot make the service read a body at all.
// A guest has no account, so a guest has no server-side cart (the
// storefront keeps a guest cart in localStorage).
app.use(asyncRoute(async (req, res, next) => {
  const email = await sessionEmail(req);
  if (!email) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.owner = email;
  next();
}));

app.use(express.json());

// owner (the session the server verified) -> cart object
// { userId, items[], createdAt, updatedAt }
const carts = new Map();

// ponytail: the map is bounded so a stream of new sessions cannot grow it
// forever — every distinct identity used to add an entry and nothing ever
// left. 1000 carts is far more than the store has live shoppers; the
// OLDEST is evicted when the cap is hit (a Map keeps insertion order).
// Ceiling: the carts are lost on restart and are per-process, so N replicas
// hold N x 1000 carts. Upgrade path: a shared store with a TTL if a cart
// ever has to survive a restart.
const MAX_CARTS = 1000;

// ponytail: a cart holds at most 50 lines. Nobody buys 51 different
// products at once, and it stops one session from filling the process.
const MAX_CART_ITEMS = 50;

function getCart(owner) {
  if (!carts.has(owner)) {
    if (carts.size >= MAX_CARTS) {
      carts.delete(carts.keys().next().value); // oldest first
    }
    const now = new Date().toISOString();
    carts.set(owner, { userId: owner, items: [], createdAt: now, updatedAt: now });
  }
  return carts.get(owner);
}

// ponytail: there is no client-supplied cart id in these routes — the cart
// IS the session, so a cart that is not the caller's is simply not
// reachable, and an item that is not in the caller's own cart is a 404,
// never a 403: the existence of somebody else's cart must not be
// confirmed. If a cart id is ever added to the routes, it must be looked
// up WITH the owner (cart.userId === req.owner) and a mismatch answered
// with 404.

// GET / - Get the signed-in visitor's cart
app.get('/', (req, res) => {
  res.json({ cart: getCart(req.owner) });
});

// POST /items - Add item to cart
app.post('/items', (req, res) => {
  const { slug, name, price, quantity, image } = req.body || {};
  const qty = Number(quantity);
  if (!slug || price == null || !Number.isFinite(qty) || qty < 1) {
    return res.status(400).json({ error: 'slug, price, and quantity are required' });
  }

  const cart = getCart(req.owner);
  const existing = cart.items.find(item => item.slug === slug);

  if (existing) {
    existing.quantity += qty;
  } else {
    if (cart.items.length >= MAX_CART_ITEMS) {
      return res.status(400).json({ error: `At most ${MAX_CART_ITEMS} items per cart` });
    }
    cart.items.push({
      slug,
      name: name || slug,
      price: Number(price),
      quantity: qty,
      image: image || ''
    });
  }

  cart.updatedAt = new Date().toISOString();
  res.status(201).json({ cart });
});

// PUT /items/:slug - Update quantity
app.put('/items/:slug', (req, res) => {
  const { slug } = req.params;
  const { quantity } = req.body || {};
  const qty = Number(quantity);
  const cart = getCart(req.owner);
  const item = cart.items.find(i => i.slug === slug);

  if (!item) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }
  if (!Number.isFinite(qty) || qty < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1' });
  }

  item.quantity = qty;
  cart.updatedAt = new Date().toISOString();
  res.json({ cart });
});

// DELETE /items/:slug - Remove item
app.delete('/items/:slug', (req, res) => {
  const cart = getCart(req.owner);
  cart.items = cart.items.filter(i => i.slug !== req.params.slug);
  cart.updatedAt = new Date().toISOString();
  res.json({ cart });
});

// DELETE / - Clear cart
app.delete('/', (req, res) => {
  const cart = getCart(req.owner);
  cart.items = [];
  cart.updatedAt = new Date().toISOString();
  res.json({ cart });
});

// ponytail: never leak HTML stack traces to API clients - always respond JSON.
// A 4xx keeps its own status (express.json answers 413 for a body over its
// 100kb limit, and the client deserves to know that was the problem, not a
// generic 500). A 5xx gets a generic message: err.message of an unexpected
// error often contains internals.
app.use((err, req, res, next) => {
  console.error('[cart-service] Unhandled error:', err);
  if (res.headersSent) return next(err);
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.type === 'entity.too.large' ? 'Request body is too large' : 'Invalid request' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3004;
// ponytail: loopback by default. The cart is internal -- the gateway is the
// only public hop -- and it resolves the caller's identity from the session
// cookie, so a direct connection must not be possible from outside this
// host. Docker sets HOST=0.0.0.0 for the container network.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Cart Service running on port ${PORT} (${HOST})`));
