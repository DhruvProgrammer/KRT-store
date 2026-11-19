# Checkout path — resource growth & hot-path review (KRT Store)

**Scope:** `services/order-service/index.js`, `services/payment-service/index.js`, `services/cart-service/index.js`, `services/api-gateway/index.js`, `services/notification-service/main.py` (read-only; `services/catalog-service/index.js` read-only for the stock question).
**Date:** 2026-11-19

---

## 1. Direct answers to the four questions

1. **O(n) scans per request:** two, both in the order service — `orders.filter(o => o.email === email)` in `GET /` and `orders.find(o => o.id === req.params.id && o.email === email)` in `GET /:id` — both linear in `orders[]`. **Nothing worse anywhere else**: payment maps are `Map.get`/`set` (O(1)); the gateway `hits.get(key)` is O(1) and `rateTier()` is a constant (≤6 tiers); cart `cart.items.find(item => item.slug === slug)` is O(≤50) (`MAX_CART_ITEMS`); notification `_rate_hits.get(NOTIFY_TOKEN)` is O(1); `fetchCatalog()` builds a 12-entry map.
2. **Is `fetchCatalog` per-order avoidable?** Yes — it runs on every `POST /` (one synchronous HTTP round trip per checkout). Same pattern exists in payment (`getCatalogPrices()` per intent) and cart (`catalogProduct()` per `POST /items`). All three get a 60s TTL cache (§2.2).
3. **Lock contention in the new synchronous stock-reservation section?** None possible: Node is single-threaded, so a synchronous check+reserve block cannot interleave with another request — no lock, no race *by construction*. Caveat: if anyone later adds an `await` between the check and the reserve, every failure exit must release the reservation. Suggested regression check: two concurrent checkouts against 1 unit of stock → exactly one 201, one 409 (§2.3).
4. **Do the new maps need eviction?** Per-map answer in §2: `orders[]` yes (cap + FIFO + new `ordersByKey` index); `inflightByKey` no cap — `finally` deletes; `reservedBySlug`/`stockBySlug` no cap — bounded by the catalog.

---

## 2. Findings

### 2.1 `orders[]` — unbounded, plus the two O(n) scans

- `GET /`: `orders.filter(o => o.email === email)` — scans every order per authenticated list call.
- `GET /:id`: `orders.find(o => o.id === req.params.id && o.email === email)` — scans every order per single-order read.
- `orders[]` is `push`ed per successful checkout and never shrinks — unbounded.

**Fix:** add an `ordersByKey` index and replace both scans:

```js
// ponytail: orders[] is capped (MAX_ORDERS, oldest-first eviction);
// ordersByKey indexes it by email so GET / and GET /:id are O(own orders)
// instead of O(all orders). Both updated together in recordOrder().
const orders = [];
const ordersByKey = new Map(); // email -> Map(orderId -> order)
const MAX_ORDERS = 10_000;

function recordOrder(order) {
  if (orders.length >= MAX_ORDERS) {
    const evicted = orders.shift();
    const list = ordersByKey.get(evicted.email);
    if (list) {
      list.delete(evicted.id);
      if (!list.size) ordersByKey.delete(evicted.email);
    }
  }
  orders.push(order);
  let list = ordersByKey.get(order.email);
  if (!list) ordersByKey.set(order.email, (list = new Map()));
  list.set(order.id, order);
}
```

- `GET /` → `const list = ordersByKey.get(email); res.json({ orders: list ? Array.from(list.values()) : [] });`
- `GET /:id` → `const order = ordersByKey.get(email)?.get(req.params.id);` (the map is keyed by email, so membership already implies the email match).

**Suggested cap:** `MAX_ORDERS = 10_000` — at ~1 KB/order that is ~10 MB worst case; long-term accounts lose their oldest receipts after that (receipts are not emailed for guests, so the practical impact is small).

### 2.2 `fetchCatalog()` per checkout — avoidable with a TTL cache

- Order service: `fetchCatalog()` on every `POST /` (the hot path). The catalog is the pricing authority and changes rarely.
- Payment service: `getCatalogPrices()` per intent creation.
- Cart service: `catalogProduct(slug)` per `POST /items` — fetches the whole catalog and then `list.find(...)` per line added.

**Fix (order service sketch):**

```js
const CATALOG_CACHE_MS = 60_000;
let catalogCache = { bySlug: null, expiresAt: 0 };
async function fetchCatalog() {
  if (catalogCache.bySlug && Date.now() < catalogCache.expiresAt) return catalogCache.bySlug;
  const res = await fetch(`${CATALOG_SERVICE_URL}/products`);
  if (!res.ok) throw new Error(`catalog responded ${res.status}`);
  const body = await res.json();
  const bySlug = new Map();
  for (const product of Array.isArray(body && body.products) ? body.products : []) {
    if (product && typeof product.slug === 'string') bySlug.set(product.slug, product);
  }
  seedStock(bySlug);
  catalogCache = { bySlug, expiresAt: Date.now() + CATALOG_CACHE_MS };
  return bySlug;
}
```

Same TTL pattern for `getCatalogPrices()` (payment) and `catalogProduct()` (cart — build a slug→product Map).

**Failure semantics are preserved:** on a cache miss + fetch failure the `throw` stands — `POST /` still answers 503 *before* the OTP is consumed (the one-shot code is not burned). A stale entry is never served while expired; on error the old cache entry is simply not used. One caveat: the two services each hold their own cached snapshot; if the catalog changes between the order service's and payment service's cache windows, the two independent price comparisons can disagree — the order fails closed ("could not be verified") just as a same-instant race would today. If exactness matters, both services can share one TTL constant and the catalog change window stays ≈ 0.

### 2.3 NEW `inflightByKey` — no cap, no leak by construction

Design: `Map<email, number>` — active checkout count per email.

- Increment at checkout entry (after `email` is known, before the reserve).
- Decrement in a `finally` that wraps the reserve → confirm/release window (see §5 sketch) — every exit path (409, the three 400s, the 503s, success) passes through it.
- Safety sweep every 30 s deleting 0-count keys (backstop for any forgotten path).

**Suggested caps/eviction:** none. The map is bounded by concurrent checkouts — the gateway's order tier is 5/min write with a ~10 s upstream timeout, so ≤ a few in flight per email. If a count is ever seen stuck > 0, the sweep could also delete entries older than, say, 10 min — add only if a leak is ever diagnosed.

### 2.4 NEW `reservedBySlug` + `stockBySlug` — bounded by the catalog, optional caps

Design (order service):

```js
// stockBySlug / reservedBySlug: slug -> units; a slug with no `stock` field is
// UNTRACKED and unlimited (today's behavior — no oversell check). Only slugs
// the order service already accepts get tracked: items are built from the
// catalog BEFORE the reserve point, and unknown slugs are rejected (400).
const stockBySlug = new Map();    // slug -> total units (from catalog)
const reservedBySlug = new Map(); // slug -> units held by in-flight checkouts
let stockSeeded = false;

function seedStock(catalog) {
  if (stockSeeded) return;
  stockSeeded = true;
  for (const product of catalog.values()) {
    if (typeof product.stock === 'number' && Number.isInteger(product.stock)) {
      stockBySlug.set(product.slug, Math.max(0, product.stock));
    }
  }
}

function availableOf(slug) {
  const stock = stockBySlug.get(slug);
  if (stock === undefined) return Infinity; // untracked -> unlimited
  return stock - (reservedBySlug.get(slug) || 0);
}

// ponytail: check + reserve in ONE synchronous block (see §2.3 "Lock contention").
function reserveStock(items) {
  for (const { slug, quantity } of items) {
    if (availableOf(slug) < quantity) return false;
  }
  for (const { slug, quantity } of items) {
    if (stockBySlug.has(slug)) {
      reservedBySlug.set(slug, (reservedBySlug.get(slug) || 0) + quantity);
    }
  }
  return true;
}

// sold=true: the order was created (stock down, reservation ends).
// sold=false: the checkout failed (reservation ends only).
function settleStock(items, sold) {
  for (const { slug, quantity } of items) {
    const stock = stockBySlug.get(slug);
    if (stock === undefined) continue;
    if (sold) stockBySlug.set(slug, stock - quantity);
    const left = (reservedBySlug.get(slug) || 0) - quantity;
    if (left <= 0) reservedBySlug.delete(slug);
    else reservedBySlug.set(slug, left);
  }
}
```

**Suggested caps/eviction:** none — both maps are seeded from the catalog, so `size ≤ #catalog slugs` (12 products today). If a cap is wanted as defense-in-depth: `MAX_STOCK_SLUGS = 1000` FIFO eviction (≈ never reached). Restock behavior: `stockBySlug` is seeded once; a new `stock` field or a new product is picked up on restart (or by deleting the entry). The invariant that bounds the maps is: only catalog slugs are inserted, and the order service rejects non-catalog slugs before the reserve point.

**Stock tracking is opt-in:** `services/catalog-service/index.js` has no `stock` field today — adding an optional integer `stock` to the 12 products enables oversell protection without changing checkout behavior for anything else.

### 2.5 Payment service: `paymentIntents` — succeeded intents kept forever

Today's sweep (every 60 s) deletes uncaptured intents older than `INTENT_TTL_MS = 15 min` but **skips `status === 'succeeded'` entirely** — the receipt of every order is retained forever: one entry per order, unbounded.

**Fix:**

```js
const INTENT_TTL_MS = 15 * 60 * 1000;                      // uncaptured (abandoned checkout)
const INTENT_RECEIPT_TTL_MS = 90 * 24 * 60 * 60 * 1000;     // captured (receipt of an order)

setInterval(() => {
  const now = Date.now();
  for (const [id, pi] of paymentIntents) {
    const createdAt = new Date(pi.createdAt).getTime();
    const ttl = pi.status === 'succeeded' ? INTENT_RECEIPT_TTL_MS : INTENT_TTL_MS;
    if (createdAt + ttl < now) paymentIntents.delete(id);
  }
  for (const [key, entry] of idempotencyKeys) {
    // the intent is gone -> swept; a receipt lives 90 days, an abandoned
    // checkout 15 minutes, so the key can be dropped in both cases
    if (!paymentIntents.has(entry.intentId)) idempotencyKeys.delete(key);
  }
}, 60_000).unref();
```

Suggested cap: ~#orders within the 90-day window (a busy store: thousands of entries — trivial). `INTENT_RECEIPT_TTL_MS = 90 days` matches the Stripe upgrade note in the file and leaves room for a late retry; the order service always captures within seconds of creation, so `createdAt` is a fine base.

### 2.6 Payment service: `idempotencyKeys` — bounded with the intents

The old sweep kept keys for succeeded intents while the intent lived. With the new sweep, keys die when their intent is swept (`!pi` branch): succeeded receipts at 90 days, uncaptured at 15 minutes. Size is therefore bounded by the intents bound (§2.5). Note the key itself is server-minted (`order-${orderId}-${uuid}`), not client-controlled, and the order id is unique per attempt, so this map cannot be minted by volume alone — it is bounded by successful or abandoned checkouts.

### 2.7 Gateway `hits` Map + buckets — bounded; no eviction needed

- Keys are `${ip}|${tier}|${max}` — distinct buckets ≈ #clients × ≤6 tiers (the 5-tier list plus the fallback). Bucket values reset on a fixed 60 s window; `peerIp` is the socket peer (never the client header, and `::ffff:`-mapped and `::1` are normalized to one bucket).
- Sweep: `setInterval(() => hits.clear(), RATE_WINDOW_MS * 5)` — a wholesale clear every 5 min. No per-key growth. Minor nit: `clear()` produces burst-then-idle patterns (everything resets at once); a per-key `resetAt` sweep would give true fixed windows — a behavior change, not needed for the growth question. **Suggested cap:** none — worst case ≈ #clients × 6 entries.

### 2.8 Cart-service `carts` map — already bounded

`MAX_CARTS = 1000`, FIFO eviction of the oldest entry (`carts.delete(carts.keys().next().value)`); `MAX_CART_ITEMS = 50` per cart. No change needed. (Minor: eviction is by insertion order, not by last use — a re-GET does not refresh a cart's position.)

### 2.9 Notification-service `_rate_hits` — single-entry map

Keyed by `NOTIFY_TOKEN` only — the only identity there is (see the comment in `_rate_limit`). Exactly 1 entry; nothing grows. If tokens were ever rotated at runtime without restart it would grow by one per token — not a current path (env is fixed at boot). No change needed.

---

## 3. Hot-path findings (checkout path, end to end)

| Path | Finding | Fix |
|---|---|---|
| `POST /` (order-svc) | `fetchCatalog()` — one synchronous HTTP round trip per checkout | TTL cache, §2.2 |
| `POST /` (payment-svc) | `getCatalogPrices()` per intent | same TTL cache |
| `POST /items` (cart-svc) | `catalogProduct()` — whole-catalog fetch + linear `find` per cart mutation | same TTL cache + Map lookup |
| `POST /` (order-svc) | NEW: stock reserve — O(≤20) map ops, synchronous | §2.4 |
| `GET /`, `GET /:id` (order-svc) | O(#orders) scans — the only O(n) per request in the system | `ordersByKey`, §2.1 |
| gateway limiter | constant-time; `hits` bounded | none |
| cart `cart.items.find` | O(≤50) | none (bounded) |
| notification `_rate_hits.get` | O(1) | none |
| `express.json` per request | bounded by Express's default 100 kb limit | none |

---

## 4. Suggested caps summary

| Map | Today | Suggested cap / eviction |
|---|---|---|
| `orders[]` (order-svc) | unbounded | `MAX_ORDERS = 10_000`, FIFO oldest-first; new `ordersByKey` index ≤ 10k entries |
| `ordersByKey` (NEW) | — | none — bounded by the `orders[]` cap |
| `inflightByKey` (NEW) | — | none — `finally` deletes; 0-count sweep every 30 s |
| `reservedBySlug` (NEW) | — | none — ≤ #catalog slugs; optional FIFO 1000 |
| `stockBySlug` (NEW) | — | none — ≤ #catalog slugs; add optional `stock` to catalog products |
| `paymentIntents` | unbounded (succeeded kept forever) | 15 min uncaptured (exists) / 90 days captured (new), sweep every 60 s |
| `idempotencyKeys` | unbounded | bounded by intents (swept with them) |
| gateway `hits` | ~#clients × tiers; clear-all 5 min | as-is; optional per-key `resetAt` sweep |
| cart `carts` | 1000 FIFO (exists) | none |
| notification `_rate_hits` | 1 entry (exists) | none |

---

## 5. Implementation sketch (order-service, full flow)

```js
// fetchCatalog: TTL cache (§2.2).

// --- new maps + stock ---
const stockBySlug = new Map();    // slug -> total units (from catalog `stock` field)
const reservedBySlug = new Map(); // slug -> units held by in-flight checkouts
let stockSeeded = false;
function seedStock(catalog) { /* §2.4 */ }
function availableOf(slug) { /* §2.4 */ }
function reserveStock(items) { /* §2.4 — check + reserve in ONE sync block */ }
function settleStock(items, sold) { /* §2.4 */ }

const inflightByKey = new Map(); // email -> active checkout count
setInterval(() => {
  for (const [email, count] of inflightByKey) {
    if (count <= 0) inflightByKey.delete(email);
  }
}, 30_000).unref();

// --- POST /: after items + total are validated, before intent creation ---
inflightByKey.set(email, (inflightByKey.get(email) || 0) + 1);
try {
  if (!reserveStock(items)) {
    return res.status(409).json({ error: 'Out of stock — please try again later' });
  }
  const orderId = getNextOrderId();
  const idempotencyKey = `order-${orderId}-${crypto.randomUUID()}`;
  let intent;
  try {
    intent = await createPaymentIntent({ key: idempotencyKey, orderId, email, paymentMethod: body.paymentMethod, items: items.map(i => ({ slug: i.slug, quantity: i.quantity })) });
  } catch (err) {
    settleStock(items, false);
    return res.status(503).json({ error: 'Payment is temporarily unavailable, please try again' });
  }
  const charged = Number(intent.amount);
  if (!Number.isFinite(charged) || Math.abs(charged - total) > AMOUNT_TOLERANCE) {
    settleStock(items, false);
    return res.status(400).json({ error: 'The order total could not be verified, please try again' });
  }
  const otpOk = await verifyCheckoutOtp(email, otp);
  if (!otpOk) {
    settleStock(items, false);
    return res.status(400).json({ error: 'Invalid or expired verification code' });
  }
  try {
    await capturePayment(intent.id);
  } catch (err) {
    settleStock(items, false);
    return res.status(503).json({ error: 'Payment could not be completed, please try again' });
  }
  const now = new Date().toISOString();
  const order = { /* unchanged shape */ };
  recordOrder(order);        // was: orders.push(order)
  settleStock(items, true);  // the order now owns the reserved units
  notifyCustomer(order);
  res.status(201).json({ order });
} finally {
  const count = (inflightByKey.get(email) || 1) - 1;
  if (count <= 0) inflightByKey.delete(email);
  else inflightByKey.set(email, count);
}
```

Notes on ordering, preserved from the current code:

- The 409-for-out-of-stock point sits *before* intent creation, so an out-of-stock checkout consumes no OTP code and no intent (money never moves for a refused checkout).
- The OTP is still consumed before capture (replay-guard preserved); a failed OTP releases the stock reservation without charging.
- `GET /` and `GET /:id` now read `ordersByKey` — response shapes unchanged (`{ orders }`, `{ order }`).

**Regression check to add (small):** with stock = 1 for a product, fire two concurrent `POST /`s of that product — assert exactly one `201` and one `409`. Also a simple smoke check of the TTL cache: toggle the catalog stub between two prices within the TTL and confirm the order service prices from the first cached value.

---

## 6. Ceilings & upgrade paths

- All in-memory state is per-process (already the case for carts). If any of these maps ever need to survive restarts or be shared across gateway replicas, the next step is a shared store — e.g., the orders array → SQLite; `paymentIntents`/`idempotencyKeys` → Stripe-side idempotency (already noted in the payment service).
- The catalog TTL cache means a restock/price change is visible to checkouts within `CATALOG_CACHE_MS` of the change (≤ 60 s).
