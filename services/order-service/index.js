const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3003';
// ponytail: the payment service is called DIRECTLY, server to server. The
// gateway does not expose it (an intent id is not the browser's business),
// so the order service is the only thing that can create or capture an
// intent -- and the only thing that can put one on an order.
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006';
// ponytail: the store is USD-only (the catalog prices are dollars), so the
// currency is fixed here instead of being taken from the client.
const PAYMENT_CURRENCY = 'USD';
// ponytail: a hung upstream must not hang the checkout forever.
const PAYMENT_TIMEOUT_MS = 10000;
// ponytail: half a cent. Both services sum the same catalog prices, but the
// payment service sorts the lines by slug and rounds to cents, so the two
// totals agree to the cent and not necessarily bit-for-bit.
const AMOUNT_TOLERANCE = 0.005;

// ponytail: Express 4 does NOT catch a rejected promise from an async
// handler — the rejection escapes as an unhandled rejection and kills the
// process. One wrapper instead of a try/catch in every handler.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ponytail: mirrors src/lib/cart.ts PAYMENT_METHODS. Keep the two in sync.
const PAYMENT_METHODS = new Set(['stripe', 'card', 'razorpay', 'upi', 'bitcoin']);
// ponytail: a slug is a URL path segment in the catalog, so it is limited to
// a conservative charset — no path traversal, no query, no whitespace.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_ITEMS = 20;
const MAX_QUANTITY = 99;
// ponytail: the same ceiling the payment service enforces (its MAX_AMOUNT),
// so a cart that the order service accepts is one the payment service can
// actually charge. Without it an order of 20 x 99 x the most expensive
// product ($116,820) would be created and then refused at payment.
const MAX_ORDER_TOTAL = 10000;
const ADDRESS_FIELDS = ['name', 'line1', 'line2', 'city', 'state', 'postalCode', 'country', 'phone'];

// ponytail: the verified address IS the order's identity. This mirrors the
// auth service's normalizeEmail so "Alice@x.com" and "alice@x.com" are one
// owner (the auth service keys the OTP rows by the normalised form).
function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// ponytail: the address is the only other client-owned field we keep. Pick the
// known keys instead of storing whatever object was posted.
function sanitizeAddress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const field of ADDRESS_FIELDS) {
    if (typeof value[field] === 'string') out[field] = value[field].trim().slice(0, 200);
  }
  return out;
}

// ponytail: prices are the catalog's, never the client's. The catalog is the
// only place that knows what a product costs. One call for the whole catalog
// (9 products today) and index by slug; upgrade path: GET /products/:slug per
// item if the catalog outgrows a single response.
async function fetchCatalog() {
  const res = await fetch(`${CATALOG_SERVICE_URL}/products`);
  if (!res.ok) throw new Error(`catalog responded ${res.status}`);
  const body = await res.json();
  const list = Array.isArray(body && body.products) ? body.products : [];
  const bySlug = new Map();
  for (const product of list) {
    if (product && typeof product.slug === 'string') bySlug.set(product.slug, product);
  }
  return bySlug;
}

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

// ponytail: the order service is the ONLY caller of the payment service. The
// client never names an intent, so the intent id stored on the order is
// always the one the payment service handed out.
//
// The amount is NEVER sent: the payment service derives it from the catalog
// too, and the two derived totals are compared by the caller. If they
// disagree, one of the two services is wrong about the price and no order
// may be created.
async function createPaymentIntent({ key, orderId, email, paymentMethod, items }) {
  const res = await fetch(`${PAYMENT_SERVICE_URL}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({
      items,
      currency: PAYMENT_CURRENCY,
      orderId,
      metadata: { email, paymentMethod }
    }),
    signal: AbortSignal.timeout(PAYMENT_TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new Error(`payment intent refused: ${res.status}`);
  }
  const body = await res.json();
  const intent = body && body.paymentIntent;
  if (!intent || typeof intent.id !== 'string' || !intent.id) {
    throw new Error('payment intent response carried no id');
  }
  return intent;
}

// ponytail: capturing is the moment the money moves. The order is created
// only when the payment service says the intent succeeded -- a 4xx, a network
// error or an intent that is not 'succeeded' all fail closed.
async function capturePayment(paymentIntentId) {
  const res = await fetch(`${PAYMENT_SERVICE_URL}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId }),
    signal: AbortSignal.timeout(PAYMENT_TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new Error(`capture refused: ${res.status}`);
  }
  const body = await res.json();
  const intent = body && body.paymentIntent;
  if (!intent || intent.status !== 'succeeded') {
    throw new Error(`capture did not succeed: ${intent && intent.status}`);
  }
  return intent;
}

// ponytail: no cookie-parser dependency — the service only ever needs one
// cookie. Parsing the Cookie header here is a handful of lines and saves a
// dependency in a service that otherwise has three.
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

// ponytail: the session is the auth service's httpOnly cookie. The token is
// forwarded as a Bearer header (the auth service accepts either) so no other
// cookie is handed to another service.
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
    console.error('[order-service] session lookup failed:', err.message);
    return null;
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
    total: order.total,
    // ponytail: the receipt describes the order the customer actually paid
    // for. The status is 'paid' because the capture succeeded -- it is not a
    // label the storefront chose.
    status: order.status,
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

// POST / - Create order
app.post('/', asyncRoute(async (req, res) => {
  const body = req.body || {};
  // ponytail: the OTP is a credential — do not print it into the log.
  console.log('[order-service] POST / received request. Body:', JSON.stringify({ ...body, otp: body.otp ? '***' : body.otp }));

  // ponytail: the client may only say WHAT it wants (slug + quantity). Price,
  // name, id, userId, total, paymentIntentId and createdAt are server-owned —
  // a body field like `userId` must never reach the order. The `x-user-id`
  // header is ignored from here on: it was client-asserted, so anybody could
  // claim another guest's orders by changing one header. `paymentIntentId` is
  // ignored for the same reason: the intent id is the payment service's to
  // hand out, not the client's to name.
  const email = normalizeEmail(body.email);
  if (!email) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  if (!otp) {
    return res.status(400).json({ error: 'Email and verification code are required' });
  }
  if (!PAYMENT_METHODS.has(body.paymentMethod)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    console.log('[order-service] Invalid request: items array is required/empty');
    return res.status(400).json({ error: 'Items array is required' });
  }
  if (body.items.length > MAX_ITEMS) {
    return res.status(400).json({ error: `At most ${MAX_ITEMS} items per order` });
  }

  const requested = [];
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return res.status(400).json({ error: 'Each item must be an object' });
    }
    if (typeof item.slug !== 'string' || !SLUG_RE.test(item.slug)) {
      return res.status(400).json({ error: 'Each item needs a valid slug' });
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return res.status(400).json({ error: `Quantity must be a whole number between 1 and ${MAX_QUANTITY}` });
    }
    requested.push({ slug: item.slug, quantity });
  }

  // ponytail: the catalog is fetched BEFORE the OTP is consumed so a catalog
  // outage does not burn the customer's one-shot code. If the catalog cannot
  // be reached the order FAILS — falling back to the posted price (or to
  // zero) would hand the price straight back to the caller.
  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch (err) {
    console.error('[order-service] catalog unavailable:', err.message);
    return res.status(503).json({ error: 'Pricing is temporarily unavailable, please try again' });
  }

  const items = [];
  for (const want of requested) {
    const product = catalog.get(want.slug);
    if (!product) {
      return res.status(400).json({ error: `Unknown product: ${want.slug}` });
    }
    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) {
      console.error('[order-service] catalog product has no usable price:', want.slug, product.price);
      return res.status(503).json({ error: 'Pricing is temporarily unavailable, please try again' });
    }
    items.push({ slug: product.slug, name: product.name, price, quantity: want.quantity });
  }

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return res.status(400).json({ error: 'Order total must be greater than zero' });
  }
  if (total > MAX_ORDER_TOTAL) {
    return res.status(400).json({ error: `Order total ${total} exceeds the maximum of ${MAX_ORDER_TOTAL}` });
  }

  // ponytail: ORDER OF OPERATIONS. The money moves LAST and the one-shot
  // code is consumed BEFORE it moves, so a code can never buy two orders.
  //
  //   1. the catalog prices the cart            (a failure here costs nothing)
  //   2. the payment service creates the intent and the two derived totals
  //      are compared                          (a failure here does NOT burn
  //                                                the code: the customer can
  //                                                retry with the same code)
  //   3. the OTP is consumed                    (the replay guard: the code is
  //                                                dead before any money moves,
  //                                                and a bad code leaves an
  //                                                UNCAPTURED intent, which
  //                                                costs nothing)
  //   4. the intent is captured                 (the money moves. A failure
  //                                                here is the ONE case that
  //                                                burns the code -- the
  //                                                payment service answered a
  //                                                moment earlier, so the
  //                                                window is a sliver)
  //   5. the order is created
  //
  // The other order (capture first, code second) would charge a customer
  // whose code turned out to be wrong, and would let a replayed code buy two
  // orders. This one cannot.
  const orderId = getNextOrderId();
  // ponytail: the idempotency key is stable for THIS attempt -- a retried
  // create returns the same intent instead of making a second one -- and
  // unique for the next one. The order id alone is not enough: the in-memory
  // counter starts at 1 again after a restart, so "order-1" would collide
  // with an order from the previous life of the process. The random part is
  // drawn once per attempt and reused for every call of that attempt.
  const idempotencyKey = `order-${orderId}-${crypto.randomUUID()}`;

  let intent;
  try {
    intent = await createPaymentIntent({
      key: idempotencyKey,
      orderId,
      email,
      paymentMethod: body.paymentMethod,
      // slug + quantity ONLY: the payment service prices them itself.
      items: items.map((i) => ({ slug: i.slug, quantity: i.quantity }))
    });
  } catch (err) {
    console.error('[order-service] payment intent failed:', err.message);
    return res.status(503).json({ error: 'Payment is temporarily unavailable, please try again' });
  }

  // ponytail: the two services priced the same cart independently. If they
  // disagree, one of them is wrong about the price and the order must not
  // exist. The intent is left uncaptured, so nothing was charged.
  const charged = Number(intent.amount);
  if (!Number.isFinite(charged) || Math.abs(charged - total) > AMOUNT_TOLERANCE) {
    console.error('[order-service] payment amount mismatch: charged', charged, 'order total', total);
    return res.status(400).json({ error: 'The order total could not be verified, please try again' });
  }

  // Require a verified email OTP before accepting the order. This is what
  // makes the address above trustworthy: the server proved the caller
  // controls that mailbox, so the verified address is the order's owner.
  // ponytail: the code is consumed here, BEFORE the capture, so a replayed
  // code cannot buy a second order. The intent created above is abandoned
  // uncaptured -- no money moved.
  const otpOk = await verifyCheckoutOtp(email, otp);
  if (!otpOk) {
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }

  try {
    await capturePayment(intent.id);
  } catch (err) {
    console.error('[order-service] capture failed:', err.message);
    return res.status(503).json({ error: 'Payment could not be completed, please try again' });
  }

  const now = new Date().toISOString();
  const order = {
    id: orderId,
    email,
    items,
    total,
    shippingAddress: sanitizeAddress(body.shippingAddress),
    // ponytail: the intent id is the one the PAYMENT SERVICE returned. The
    // client used to be able to post any string here and have it stored
    // untouched -- that is the same bug class as the x-user-id header that
    // was removed. A posted `paymentIntentId` is now ignored.
    paymentIntentId: intent.id,
    paymentMethod: body.paymentMethod,
    // ponytail: the order exists only after a successful capture, so 'paid'
    // is a fact, not a hope. There is no 'pending' order to advance later.
    status: 'paid',
    createdAt: now,
    updatedAt: now
  };

  orders.push(order);
  notifyCustomer(order);
  res.status(201).json({ order });
}));

// GET / - List the signed-in account's orders
// ponytail: the owner of an order is the address the server VERIFIED (the
// OTP proof), never a client header. Listing therefore needs a real session:
// we ask the auth service who the krt_access cookie belongs to and return
// only that account's orders. A guest has no account, so a guest has no list
// — the receipt email is how a guest receives the download links.
//
// ponytail: no single-use claim token for guests. Nothing in the storefront
// reads GET /api/orders/:id (the guest's deliverable is the emailed
// receipt), and a token that is never emailed is useless — the mail
// template has no field for it. Upgrade path: when the notification service
// grows a `claim_url` field, mint 32 random bytes per order, store the
// SHA-256, and compare it with crypto.timingSafeEqual.
app.get('/', asyncRoute(async (req, res) => {
  const email = await sessionEmail(req);
  if (!email) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  res.json({ orders: orders.filter(o => o.email === email) });
}));

// GET /:id - Get single order
app.get('/:id', asyncRoute(async (req, res) => {
  const email = await sessionEmail(req);
  if (!email) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const order = orders.find(o => o.id === req.params.id && o.email === email);
  if (!order) {
    // 404, not 403: a stranger's order must not even be confirmed to exist.
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
}));

// ponytail: never leak HTML stack traces to API clients - always respond JSON.
// A 4xx keeps its own status (express.json answers 413 for a body over its
// 100kb limit, and the client deserves to know that was the problem, not a
// generic 500). A 5xx gets a generic message: err.message of an unexpected
// error often contains internals.
app.use((err, req, res, next) => {
  console.error('[order-service] Unhandled error:', err);
  if (res.headersSent) return next(err);
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.type === 'entity.too.large' ? 'Request body is too large' : 'Invalid request' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3005;
// ponytail: loopback by default. The order service is internal -- the
// gateway is the only public hop -- and it resolves the caller's identity
// from the session cookie, so a direct connection must not be possible from
// outside this host. Docker sets HOST=0.0.0.0 for the container network.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Order Service running on port ${PORT} (${HOST})`));
