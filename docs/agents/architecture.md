# KRT Store — Checkout Flow & Trust-Boundary Map

End-to-end trace of a purchase, the trust-boundary table (who asserts vs. who
verifies), the validation-location inventory per endpoint, and the design plug-in
points for a client-generated checkout attempt id and for stock reservation.

---

## 1. Flow trace (end-to-end)

### 1.1 Pre-checkout (cart) — display data, re-priced at order time

- `src/lib/cart.ts:187` — browser computes the displayed `total` as Σ `price × quantity`
  from localStorage (`dg-cart`). This is advisory: order-service re-prices from the
  catalog. `validateItem` (`src/lib/cart.ts:64-77`) only checks shape.
- `GET /api/cart` → gateway (services map, `services/api-gateway/index.js:218`) →
  cart-service `GET /` (`services/cart-service/index.js:122-124`). Session
  middleware resolves identity via `auth-service /me` (`services/cart-service/index.js:53-67`);
  401 if no session (`services/cart-service/index.js:74-81`).
- `POST /api/cart/items` → cart-service (`services/cart-service/index.js:141-189`):
  slug non-empty (147-149), quantity must be a JSON number, integer, ≥ 1 (150-152);
  price + name come from the catalog via `catalogProduct` (132-138, fetch /products);
  stored on the cart (178-184). Cart cap: 50 lines (`MAX_CART_ITEMS`, 100; check at 175-177).
  Note: cart-service has **no** `SLUG_RE` — an unknown slug is rejected by the catalog
  lookup itself (161-162).
- `PUT /api/cart/items/:slug` (192-209), `DELETE /api/cart/items/:slug` (212-217),
  `DELETE /api/cart/` (220-225).

### 1.2 Step 1 — Browser → Gateway: `POST /api/auth/send-otp`

(`CheckoutForm.tsx:175-197`, `sendCode`)

1. Browser asserts `{ email, purpose: 'checkout' }` (`CheckoutForm.tsx:180-187`).
   Client-side email check: `isValidEmail` regex (`CheckoutForm.tsx:169`).
2. Gateway: no auth, rate limit **10/min/IP** (`services/api-gateway/index.js:126`).
   Pure proxy; gateway strips client-asserted `x-forwarded-for`/`x-real-ip`/`forwarded`
   (260-262) and re-sets them from the socket peer (269-271).
3. auth-service `POST /send-otp` (`services/auth-service/index.js:661-706`):
   email format (295-301), purpose allowlist `OTP_PURPOSES` includes `'checkout'` (146;
   checked 670-672), generates a 6-digit code with `crypto.randomInt` (368-370), stores
   hash + salt in the `otps` table (684-687), 10-minute expiry (678), only the newest
   code per (email, purpose) is live (DELETE at 682). Delivery is fire-and-forget via
   notification-service `POST /notify/otp` (608-651). In dev the code is logged
   (703) — in production it is not returned (694-701).

### 1.3 Step 2 — Browser → Gateway: `POST /api/orders`

(`CheckoutForm.tsx:282-300`, `handleSubmit`)

Browser asserts exactly `{ email, otp, items: [{ slug, quantity }], paymentMethod }`
(`CheckoutForm.tsx:294-299`) — **no price, no name, no total, no id** ("the client
only says WHAT it wants", 290-293). Client-side checks: `isValidEmail` (169) and
`otp.length === 6` (271).

Gateway: rate limit **5/min/IP** (`services/api-gateway/index.js:121`). Pure proxy —
the gateway deliberately has **no** `express.json()` (198-200); it strips `x-user-id`
(268). Proxies to order-service (services map, 219).

### 1.4 Step 3 — Order-service: `POST /` (the order-creating endpoint)

(`services/order-service/index.js:246-427`)

1. **Validate browser assertions** (the client may only say what it wants; price,
   name, id, total are server-owned — comment 251-257):
   - `email`: normalize + format (258-261)
   - `otp`: non-empty (262-265)
   - `paymentMethod`: ∈ `PAYMENT_METHODS` set (41, 266-268)
   - `items`: array, non-empty, ≤ 20 lines (269-275)
   - per item: `slug` matches `SLUG_RE` (282-284); `quantity` is a JSON number,
     integer, 1..99 (288-291)
2. **Price from the catalog**: `fetchCatalog()` **before** the OTP is consumed
   (299-305; def 80-90). A catalog outage → 503, no order, code not burned
   (295-305). Items built with catalog `name` + `price` (307-319).
3. **Server-side total**: `total = Σ price × quantity` (321); must be > 0 and
   ≤ `MAX_ORDER_TOTAL = 10000` (322-327; line 51).
4. `orderId = getNextOrderId()` (353; counter at 238-243).
5. **Create payment intent** (server→server): `createPaymentIntent` (117-138) →
   `POST ${PAYMENT_SERVICE_URL}/` with header `Idempotency-Key: order-${orderId}-${uuid}`
   (360, 118-121) and body `{ items: [{ slug, quantity }], currency: 'USD', orderId,
   metadata: { email, paymentMethod } }` (121-126). Slug+quantity only — "the payment
   service prices them itself" (369-370). Payment service is NOT proxied by the
   gateway (gateway/index.js:203-214, 215-220); it is called on 127.0.0.1:3006.
6. **Cross-check the two independently-derived totals**: payment-service derives the
   amount from the same catalog (see 1.5); order-service compares to its own sum with
   ± `AMOUNT_TOLERANCE = 0.005` (377-384; line 33). Mismatch → 400, intent abandoned
   uncaptured (377-384 comment).
7. **Consume the OTP** (392-395 via `verifyCheckoutOtp` 94-107):
   `POST auth-service /verify-otp { email, otp, purpose: 'checkout' }`. The code is
   one-shot — this is what makes the address trustworthy ("the server proved the
   caller controls that mailbox", comment 386-389). Note ordering: the code is
   consumed **before** capture, so a bad code never burns a capture (329-352).
8. **Money moves at capture** (397-402 via `capturePayment` 143-159):
   `POST payment-service /capture { paymentIntentId }`. Anything other than success
   → 503, no order. Payment-service marks `status = 'succeeded'`
   (`services/payment-service/index.js:296-297`).
9. **Create the order** (404-422): `{ id, email (verified), items (catalog), total
   (server sum), shippingAddress (sanitized, 67-74), paymentIntentId (the id the
   PAYMENT SERVICE returned; any posted `paymentIntentId` is ignored, 252-257,
   414-415), paymentMethod, status: 'paid' (419 — created only after capture),
   createdAt, updatedAt }`.
10. `orders.push(order)` (424); `notifyCustomer(order)` — fire-and-forget receipt via
    notification-service `POST /notify/order` (200-235); `201 { order }` (426-427).

### 1.5 Payment-service (internal only)

(`services/payment-service/index.js`)

- `POST /` (95-276): **rejects a client-supplied `amount`** (102-106 — "Amount is
  derived server-side"). Requires `Idempotency-Key` header (110-115). Currency
  restricted to `USD` (119-122). `orderId` must be numeric (127-132). Metadata
  allowlist `[email, paymentMethod]`, values 1..254 chars, paymentMethod validated
  (134-163). `metadata.email` required, valid format (169-173). Items: slug+quantity,
  `SLUG_RE`, integer 1..99 (188-206).
- **Idempotency**: `idempotencyId = ${email}:${key}` (216); a prior entry with the
  same fingerprint (fingerprint = request, not amount: 207-214) returns the same
  intent 200 (222-223); a different body → 409 (218-221).
- **Price derivation**: `getCatalogPrices()` (83-92, fetch /products); total = Σ
  price×quantity, rounded to cents (235-249); must be > 0 and ≤ `MAX_AMOUNT = 10000`
  (253-255). Creates the intent `{ id, amount, currency, items, orderId, metadata,
  status: 'requires_capture' }` (257-268).
- `POST /capture` (279-299): shape check (284), intent exists (288-291), status not
  already succeeded (292-294). Sets `status = 'succeeded'` + `capturedAt` (296-297).
- TTL sweep: uncaptured intents evicted after 15 min; idempotency keys evicted with
  them (56-74).

### 1.6 Session-verified reads (identity for cart/orders)

- `GET /api/cart` → cart-service `GET /` (cart-service/index.js:122-124) — identity
  from `auth-service /me` (53-67); 401 without a session (74-81).
- `GET /api/orders` → order-service `GET /` (order-service/index.js:442-448):
  `sessionEmail(req)` → `POST auth-service /me` (184-198); filters by the verified
  email.
- `GET /api/orders/:id` (451-462): `find(o => o.id === req.params.id && o.email ===
  email)`; 404 if not found (458-460) — "a stranger's order must not even be
  confirmed to exist."

### 1.7 Summary of the money path

```
Browser: POST /api/orders {email, otp, items[{slug, quantity}], paymentMethod}
  └─ Gateway (5/min) → Order-service
       1. validate browser assertions (email/otp/paymentMethod/items/slug/qty)
       2. price from catalog → total (server sum)
       3. POST payment-service / (Idempotency-Key, slug+qty only)
             └─ payment-service derives amount from catalog (rejects client amount)
       4. POST auth-service /verify-otp → CONSUME code (ownership proof)
       5. POST payment-service /capture → status = 'succeeded'  ← MONEY MOVES
       6. create order {status: 'paid'} → 201
```

---

## 2. Trust-boundary table

Columns: hop / what the client/browser asserts / what the server verifies / authority verdict.

| # | Hop | Client asserts | Server verifies | Authority verdict |
|---|-----|----------------|-----------------|-------------------|
| 1 | Browser → Gateway `POST /api/auth/send-otp` | `{email, purpose: 'checkout'}` | Rate tier only (gateway/index.js:126). auth-service: email format (295-301), purpose allowlist (146, 670-672); generates the code server-side (368-370); stores it hashed (684-687) | Gateway: rate-limited. Auth-service: the code exists only server-side |
| 2 | Browser → Gateway `POST /api/orders` | `{email, otp, items[{slug, quantity}], paymentMethod}` | Gateway: rate 5/min/IP (gateway/index.js:121); no body parse, strips `x-user-id` (260-262, 268) | Gateway: rate only |
| 3 | Gateway → Order-service `POST /` | — | order-service verifies: email format (order-service/index.js:258-261); OTP presence (262-265); paymentMethod ∈ set (266-268); items shape 1..20 (269-275); slug (282-284); quantity integer 1..99 (288-291); **catalog slug existence + price** (282-284, 307-319); total 0 < total ≤ 10000 (321-327); OTP verify (392-395) | Order-service re-derives everything |
| 4 | Order-service → Auth-service `POST /verify-otp` | `{email, otp, purpose: 'checkout'}` (order-service/index.js:97-101) | auth-service: hash verify timing-safe (359-364), expiry + purpose (738-742), consumes the row (753) | **Identity = server-verified OTP, never a header** (order-service/index.js:386-395) |
| 5 | Order-service → Payment-service `POST /` | `{items[{slug, quantity}], currency, orderId, metadata{email, paymentMethod}}` — **no amount** (order-service/index.js:121-126, 369-370) | payment-service rejects client amount (payment-service/index.js:102-106); derives total from catalog (226-255); verifies Idempotency-Key (110-115) + scope/fingerprint (216-224); order-service cross-checks ±0.005 (order-service/index.js:377-384) | **Price/total from catalog on both sides** — two independent derivations, compared by the caller |
| 6 | Order-service → Payment-service `POST /capture` | `{paymentIntentId}` from the service (order-service/index.js:398); client-posted `paymentIntentId` ignored (252-257, 414-415) | payment-service verifies intent exists (288-291) + status not succeeded (292-294) | **Capture is the money-move event** (order-service/index.js:140-142, 397-402) |
| 7 | Order-service → Notification-service `POST /notify/order` | `{email, order_id, items, total, status, store_name, created_at}` (order-service/index.js:206-223) | Internal-only; **not proxied** (gateway/index.js:203-214); `x-notify-token` | Receipt email only; no browser involved |
| 8 | Browser ← Gateway `201 {order}` | — | Server-owned fields: id (order-service/index.js:353, 406), email (verified), items + total (server sum, 321-327), paymentIntentId (service-issued, 414-415), `status: 'paid'` (419) | Browser can display, cannot assert the total or owner |
| 9 | Browser → Gateway `GET /api/cart` | — | cart-service: session identity via auth-service `/me` (cart-service/index.js:53-67); 401 without session (74-81) | Identity from session cookie |
| 10 | Browser → Gateway `POST /api/cart/items` | `{slug, quantity}` (cart-service/index.js:142-143) | cart-service: slug non-empty + catalog lookup (147-162); quantity integer ≥ 1 (150-152); **price/name from catalog** (164-184); ≤ 50 lines (100, 175-177) | Price/name = catalog; identity = session |

---

## 3. Validation-location inventory (today)

| Service / endpoint | What is validated, where | Key checks (file:line) |
|---|---|---|
| **Browser — CheckoutForm.tsx** | Advisory only | `isValidEmail` (169); `otp.length === 6` (271); asserts `{email, otp, items[{slug, quantity}], paymentMethod}` (294-299) |
| **api-gateway** | Rate + header hygiene | `/api/orders` 5/min/IP (gateway/index.js:121); strips `x-forwarded-for`/`x-real-ip`/`forwarded`/`x-user-id` (260-262, 268); no body parse (198-200). Proxies: auth/catalog/cart/orders (215-220) — payment + notification NOT proxied (203-214) |
| **order-service `POST /`** | The checkout gate | email format (258-261); OTP (262-265 → 392-395 via auth-service); `paymentMethod` ∈ set (266-268); `items` 1..20 (269-275); slug `SLUG_RE` (282-284); quantity integer 1..99 (288-291); catalog slug + price (282-284, 307-319); total ≤ 10000 (321-327); amount ±0.005 (377-384); address sanitized (67-74, 410) |
| **order-service `GET /`, `GET /:id`** | Ownership | `sessionEmail` via auth-service `/me` (184-198); filter/match by verified email (442-462); 404 not 403 (458-460) |
| **payment-service `POST /`** | Price + idempotency | amount rejected (102-106); `Idempotency-Key` required (110-115); currency USD (119-122); `orderId` numeric (127-132); metadata allowlist (134-163); email required (169-173); items slug+quantity (188-206); catalog-derived total ≤ 10000 (226-255); scope+fingerprint idempotency (216-224) |
| **payment-service `POST /capture`** | Money-move guard | intent exists (284-291); not already succeeded (292-294) |
| **cart-service `GET /`** | Identity | session via auth-service `/me` (53-67); 401 (74-81) |
| **cart-service `POST /items`** | Price + shape | slug non-empty + catalog lookup (147-162); quantity integer ≥ 1 (150-152); price/name from catalog (164-184); ≤ 50 lines (100, 175-177) |
| **cart-service `PUT /items/:slug`** | Shape | quantity integer ≥ 1 (202-204) |
| **auth-service `POST /send-otp`** | Email + purpose | email format (295-301), purpose allowlist (670-672); rate 5/min per (IP,email) + 5/min per recipient (654-659) |
| **auth-service `POST /verify-otp`** | **The checkout gate** | hash verify timing-safe (359-364); expiry + purpose (738-742); consume row (753); 6-digit codes (368-370) |
| **auth-service `GET /me`** | Session verify | JWT verify + user lookup (1051-1077) |

Summary: browser checks are advisory; the server-side checks live in
order-service (price + ownership + capture), payment-service (amount +
idempotency), cart-service (session + catalog price), and auth-service (OTP
verification).

---

## 4. Design plug-in point: client-generated "checkout attempt id"

There is **no attempt id today** (grep: no `checkoutAttemptId`/`ordersByKey`
anywhere). The contract, for the other agents:

1. **Browser (`CheckoutForm.tsx`)**: generate `checkoutAttemptId` per submit
   (e.g. `crypto.randomUUID()`, validated as a bounded printable string ≤ 128
   chars) and include it in the `POST /api/orders` body (next to `email`, `otp`,
   `items`, `paymentMethod`).
2. **Gateway**: passes it through untouched (no parsing, gateway/index.js:198-200).
3. **Order-service (`order-service/index.js`)**:
   - `ordersByKey: Map<string, string>` — on `POST /`: if
     `ordersByKey.has(attemptId)`, return the existing order (200). A retry of the
     same attempt returns the same order; a new attempt creates a new order.
   - **Inflight dedup**: a second request with the same attempt id that arrives
     while the first is still running shares the first request's outcome (e.g. via
     an `inflight: Map<string, Promise>`), so a double-click can never create two
     orders or double-capture.
   - Bound the map (e.g. prune keys older than a TTL, or delete the key once the
     order is returned for the first time — orders are in-memory anyway, so the
     ceiling is the order array itself).
4. **Payment-service Idempotency-Key**: order-service sends the client attempt id
   as the key, scoped by email (`idempotencyId = `${email}:${key}``,
   payment-service/index.js:216). Retry with same key + same fingerprint → same
   intent (222-223); same key + different body → 409 (218-221). This composes with
   the existing `order-${orderId}-${uuid}` key (order-service/index.js:360) — the
   attempt id is the client-provided identity for the attempt, the current key is
   the fallback when none is provided.

---

## 5. Design plug-in point: stock reservation (order-service)

The order service is the money-path owner (order-service/index.js:24, 109-116),
so it owns reservation. There is **no stock today** — no `reserve`/`stock` in the
checkout path, and catalog-service products are hardcoded with no stock field
(`services/catalog-service/index.js:9-196`). Seed `inventory` from a new catalog
`stock` field or a config table.

Mechanics (sync critical section — Node is single-threaded, so no `await` between
check and decrement is atomic w.r.t. other requests):

```js
// after the total check, BEFORE createPaymentIntent (order-service/index.js:321-327)
const reserved = [];
for (const item of items) {
  const avail = inventory.get(item.slug);
  if (avail === undefined || avail < item.quantity) {
    for (const r of reserved) inventory.set(r.slug, inventory.get(r.slug) + r.quantity); // release
    return res.status(400).json({ error: `Out of stock: ${item.slug}` });
  }
  reserved.push(item);
  inventory.set(item.slug, avail - item.quantity);
}
```

**Release (restock) on failure** — every failure path after the reserve must give
the quantity back, because the order/money never materialized:
- `createPaymentIntent` throws → restock (order-service/index.js:372-375)
- amount mismatch vs. payment-service → restock (377-384)
- OTP verify fails → restock (392-395)
- `capturePayment` fails (503) → restock (397-402) — note capture is the last
  failure path where stock would otherwise be silently consumed with no order

On success the stock stays consumed (the order exists).

Interaction with idempotency: on a retry (`ordersByKey` hit or inflight join),
return before reserving — the stock was already consumed by the first attempt.

---

## 6. Notes / caveats

- In-memory state everywhere: `orders[]` (order-service/index.js:238-239),
  payment `intents` + `idempotencyKeys` with TTL sweep (payment-service/index.js:41-46,
  56-74), per-IP rate buckets (gateway/index.js:142-196). Restart clears it; that is
  accepted today (ponytail comments: "same shape as the auth service's rateLimit()").
- `AMOUNT_TOLERANCE = 0.005` (order-service/index.js:33): payment-service sorts item
  lines by slug (payment-service/index.js:209), the order service does not, so the
  two derived totals agree to the cent, not bit-for-bit.
- The order is created **only after** a successful capture: `status: 'paid'` is a
  fact, not a hope (order-service/index.js:417-419).
- selftest: `services/order-service/selftest.cjs` asserts the price is the
  catalog's, the owner is the verified email, `x-user-id` never unlocks the list,
  and no order/capture happens on failure paths (assertions at 220-387).
