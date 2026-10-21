const express = require('express');
const cors = require('cors');

const app = express();
// ponytail: CORS and rate limiting belong to the api-gateway. This service is
// `expose`d (internal only, never published) and the gateway overwrites the
// upstream CORS headers on the way out, so the bare cors() below is inert for
// browser traffic. Do NOT add an origin allowlist or a rate limiter here -- it
// would be a second, divergent copy of the gateway's policy.
app.use(cors());
app.use(express.json());

// ponytail: the catalog is the ONLY source of truth for prices. The client
// says WHICH products it wants (slug + quantity); the money is computed here.
// A client-supplied `amount` is rejected, never read.
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3003';
// ponytail: the store is USD-only (catalog prices and the storefront price
// formatter are dollars). Anything else is rejected instead of silently
// converted.
const CURRENCIES = ['USD'];
// ponytail: `amount` is in dollars, the same unit as the catalog prices and
// the order total. A real Stripe call converts once, at the boundary:
// amount_cents = amount * 100. Keeping one unit across the repo avoids a
// factor-of-100 bug between the intent and the order it pays for.
const MAX_AMOUNT = 10000;      // $10k ceiling; the catalog max is 59 * 99 = 5841
const MAX_ITEMS = 20;          // same ceiling as the order service
const MAX_QUANTITY = 99;       // same ceiling as the storefront cart
const MAX_METADATA_VALUE_LEN = 254;
// ponytail: a slug is a URL path segment in the catalog, so it is limited to
// a conservative charset — no path traversal, no query, no whitespace. Same
// regex as the order service, so one client is never accepted by one service
// and rejected by the other.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// ponytail: mirrors src/lib/cart.ts PAYMENT_METHODS. Keep the two in sync.
const PAYMENT_METHODS = ['stripe', 'card', 'razorpay', 'upi', 'bitcoin'];
// ponytail: metadata is a bounded label bag, not a free-form object. Only the
// keys the checkout actually produces are accepted, so nothing else can be
// smuggled into the intent (it is persisted and echoed back).
const ALLOWED_METADATA_KEYS = ['email', 'paymentMethod'];

// In-memory Map for payment intents: id -> paymentIntent object
const paymentIntents = new Map();
// ponytail: Idempotency-Key -> { fingerprint, intentId }. In-memory and
// unbounded, like the intents Map above; a real deployment keeps idempotency
// keys in Stripe (24h TTL) instead of in the process.
const idempotencyKeys = new Map();
let nextId = 1;

// ponytail: both maps are swept. The order service creates the intent BEFORE
// it checks the code, so an abandoned attempt leaves an uncaptured intent
// behind -- and nothing ever cleaned it up. 5 attempts/min/IP is 7,200 a
// day per IP, and the payment service is a HARD dependency of checkout: if
// it runs out of memory, checkout is down for everybody. An uncaptured
// intent is dead after a few minutes anyway (nobody captures one that
// belongs to a failed checkout), so the TTL is short on purpose.
const INTENT_TTL_MS = 15 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - INTENT_TTL_MS;
  for (const [id, pi] of paymentIntents) {
    // a CAPTURED intent is the receipt of a real order -- keep those
    if (pi.status === 'succeeded') continue;
    if (new Date(pi.createdAt).getTime() < cutoff) paymentIntents.delete(id);
  }
  for (const [key, entry] of idempotencyKeys) {
    const pi = paymentIntents.get(entry.intentId);
    if (!pi) {
      idempotencyKeys.delete(key);
      continue;
    }
    if (pi.status !== 'succeeded' && new Date(pi.createdAt).getTime() < cutoff) {
      idempotencyKeys.delete(key);
    }
  }
}, 60_000).unref();

function getNextId() {
  return String(nextId++);
}

// ponytail: one request -> one catalog snapshot. A single /products call is
// cheaper than one /products/:slug per line and prices every line from the
// same snapshot.
async function getCatalogPrices() {
  const res = await fetch(`${CATALOG_SERVICE_URL}/products`, {
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error(`catalog service responded ${res.status}`);
  const { products } = await res.json();
  const prices = new Map();
  for (const p of products || []) prices.set(p.slug, Number(p.price));
  return prices;
}

// POST / - Create payment intent
app.post('/', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

    // ponytail: the amount is NEVER taken from the request. A client that
    // still sends one gets a loud 400 rather than silently paying the
    // server-derived total.
    if (body.amount !== undefined) {
      return res.status(400).json({
        error: 'Amount is derived server-side. Send items[{ slug, quantity }] instead of amount.'
      });
    }

    // ponytail: the key is required, not optional. An optional key gives no
    // guarantee -- the client that forgets it still double-charges.
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[\x21-\x7E]{1,255}$/.test(key)) {
      return res.status(400).json({
        error: 'Idempotency-Key header is required (1-255 printable ASCII characters)'
      });
    }
    if (body.currency !== undefined && typeof body.currency !== 'string') {
      return res.status(400).json({ error: 'currency must be a string' });
    }
    const currency = (body.currency || 'USD').toUpperCase();
    if (!CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: `Unsupported currency. Allowed: ${CURRENCIES.join(', ')}` });
    }

    // ponytail: orderId is a numeric id label, not proof of anything -- the
    // order service assigns the ids and links them back via paymentIntentId.
    let orderId = null;
    if (body.orderId !== undefined && body.orderId !== null) {
      orderId = String(body.orderId);
      if (!/^\d{1,20}$/.test(orderId)) {
        return res.status(400).json({ error: 'orderId must be a numeric id (1-20 digits)' });
      }
    }

    let metadata = {};
    if (body.metadata !== undefined && body.metadata !== null) {
      if (typeof body.metadata !== 'object' || Array.isArray(body.metadata)) {
        return res.status(400).json({ error: 'metadata must be an object' });
      }
      for (const k of Object.keys(body.metadata)) {
        if (!ALLOWED_METADATA_KEYS.includes(k)) {
          // ponytail: the key is echoed back, but sanitised and truncated --
          // the error body is JSON, and a raw key is attacker-controlled.
          const safe = String(k).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
          return res.status(400).json({
            error: `metadata key "${safe}" is not allowed. Allowed: ${ALLOWED_METADATA_KEYS.join(', ')}`
          });
        }
        const v = body.metadata[k];
        if (typeof v !== 'string' || v.length === 0 || v.length > MAX_METADATA_VALUE_LEN) {
          return res.status(400).json({
            error: `metadata.${k} must be a non-empty string of at most ${MAX_METADATA_VALUE_LEN} characters`
          });
        }
        if (k === 'paymentMethod' && !PAYMENT_METHODS.includes(v)) {
          return res.status(400).json({ error: `metadata.paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}` });
        }
      }
      // ponytail: rebuilt in a fixed key order so the fingerprint below does
      // not depend on how the client ordered its JSON.
      for (const k of ALLOWED_METADATA_KEYS) {
        if (k in body.metadata) metadata[k] = body.metadata[k];
      }
    }
    // ponytail: the email is REQUIRED. It is the customer identity the
    // idempotency key space is scoped to (below), and a payment intent with no
    // customer cannot be reconciled with an order. Normalised exactly like the
    // order service does it (trim + lowercase, same regex) so both services
    // key the same customer the same way.
    const email = String(metadata.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'metadata.email is required (a valid email address)' });
    }
    metadata.email = email;
    // ponytail: the idempotency key space is scoped to the customer email, so
    // one customer's key can never return another customer's intent, and one
    // customer cannot pre-empt another's key. The email is NOT verified here
    // (the order service does that) and this service does not authenticate the
    // caller -- the gateway owns auth and rate limiting. Collision-avoidance,
    // not a security boundary.
    const scope = email;

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'items is required: [{ slug, quantity }]' });
    }
    if (body.items.length > MAX_ITEMS) {
      return res.status(400).json({ error: `Too many item lines (max ${MAX_ITEMS})` });
    }
    const lines = [];
    for (const item of body.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'Each item must be an object { slug, quantity }' });
      }
      // ponytail: only slug + quantity are read. A client-supplied price/name
      // inside the item is ignored, so it cannot influence the amount.
      if (typeof item.slug !== 'string' || !SLUG_RE.test(item.slug)) {
        return res.status(400).json({ error: 'Each item needs a valid slug' });
      }
      // ponytail: the quantity must be a JSON NUMBER that is a whole number.
      // Number("1e1") is 10, Number(true) is 1 and Number([1]) is 1, so a
      // coercion check alone accepts a body that is not a quantity at all.
      const quantity = item.quantity;
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return res.status(400).json({ error: `Each item needs an integer quantity between 1 and ${MAX_QUANTITY}` });
      }
      lines.push({ slug: item.slug, quantity });
    }
    // ponytail: sorted so the fingerprint does not depend on the order the
    // client happened to send the cart in.
    lines.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

    // ponytail: the fingerprint is the REQUEST, not the derived amount. A
    // price change between the first call and the retry must not turn a
    // legitimate retry into a 409 -- the retry returns the original intent.
    const fingerprint = JSON.stringify({ items: lines, currency, orderId, metadata });

    const idempotencyId = `${scope}:${key}`;
    const prior = idempotencyKeys.get(idempotencyId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        return res.status(409).json({ error: 'Idempotency-Key was already used with a different request body' });
      }
      const priorIntent = paymentIntents.get(prior.intentId);
      if (priorIntent) return res.status(200).json({ paymentIntent: priorIntent });
    }

    let prices;
    try {
      prices = await getCatalogPrices();
    } catch (err) {
      // ponytail: fail closed. No catalog price, no payment intent.
      console.error('[payment-service] catalog lookup failed:', err.message);
      return res.status(503).json({ error: 'Pricing service unavailable, try again' });
    }

    const priced = [];
    let total = 0;
    for (const line of lines) {
      const price = prices.get(line.slug);
      if (price === undefined) {
        return res.status(400).json({ error: `Unknown product slug "${line.slug}"` });
      }
      if (!Number.isFinite(price) || price <= 0) {
        console.error(`[payment-service] catalog price for ${line.slug} is not usable:`, price);
        return res.status(503).json({ error: 'Pricing service unavailable, try again' });
      }
      priced.push({ slug: line.slug, quantity: line.quantity, price });
      total += price * line.quantity;
    }
    total = Math.round(total * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'Derived total must be greater than 0' });
    }
    if (total > MAX_AMOUNT) {
      return res.status(400).json({ error: `Total ${total} exceeds the maximum of ${MAX_AMOUNT}` });
    }

    const id = getNextId();
    const pi = {
      id,
      amount: total,
      currency,
      items: priced,
      orderId,
      metadata,
      status: 'requires_capture',
      createdAt: new Date().toISOString(),
      capturedAt: null
    };

    paymentIntents.set(id, pi);
    idempotencyKeys.set(idempotencyId, { fingerprint, intentId: id });
    res.status(201).json({ paymentIntent: pi });
  } catch (err) {
    next(err);
  }
});

// POST /capture - Capture payment
app.post('/capture', (req, res) => {
  const { paymentIntentId } = req.body || {};
  // ponytail: shape check only. The payment service does not authenticate the
  // caller -- the gateway owns auth and rate limiting (see the top of the
  // file). Nothing here is a credential.
  if (typeof paymentIntentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(paymentIntentId)) {
    return res.status(400).json({ error: 'paymentIntentId is required' });
  }

  const pi = paymentIntents.get(paymentIntentId);
  if (!pi) {
    return res.status(404).json({ error: 'Payment intent not found' });
  }
  if (pi.status === 'succeeded') {
    return res.status(400).json({ error: 'Payment already captured' });
  }

  pi.status = 'succeeded';
  pi.capturedAt = new Date().toISOString();
  res.json({ paymentIntent: pi });
});

// ponytail: never leak a stack trace or a raw body-parser message to the
// client (the JSON parser puts the offending body in err.message).
app.use((err, req, res, next) => {
  console.error('[payment-service] unhandled error:', err.message);
  if (res.headersSent) return next(err);
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Invalid request body' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3006;
// ponytail: loopback by default. The payment service creates and captures
// intents and is NOT proxied by the gateway, so nothing outside this host
// has any reason to reach it. Docker sets HOST=0.0.0.0 for the container
// network.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => console.log(`Payment Service running on port ${PORT} (${HOST})`));
