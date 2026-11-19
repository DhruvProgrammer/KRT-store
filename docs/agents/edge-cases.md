# Checkout Edge-Case Audit

Audit of every ingress point of the new checkout design: the order placement
endpoint (`POST /api/orders` → `services/order-service`), the server-to-server
payment endpoint (`POST /api/payments` → `services/payment-service`), the cart
endpoints (`/api/cart` → `services/cart-service`), the registration endpoint
(`POST /api/auth/register` → `services/auth-service`), the browser-facing
`POST /api/orders` through `services/api-gateway`, and the client-side guards
in `src/components/CheckoutForm.tsx` + `src/lib/cart.ts`.

Legend per row: **Current** = behavior as implemented; **Desired** = behavior
the spec / code intent prescribes. "MATCH" means the two agree (noted for
completeness). Gaps are listed in Part 2.

---

## Part 1 — Input × Endpoint × Current × Desired

### 1.1 `POST /api/orders` — order-service (the purchase ingress)

`normalizeAttemptId(value)`: `typeof value === 'string' && 1 ≤ length ≤ 255 &&
/^[\x21-\x7E]+$/`; handler: `attemptId = normalizeAttemptId(body.checkoutAttemptId) || crypto.randomUUID()`.

| # | Input | Current | Desired |
|---|-------|---------|---------|
| A1 | `checkoutAttemptId` missing (absent) | `null` → server-generated `crypto.randomUUID()` | Desired: server uuid for absent — **MATCH** |
| A2 | `checkoutAttemptId: null` | `null` → uuid | uuid — **MATCH** |
| A3 | Number (`5`, `0`, `1e9`) | typeof ≠ string → null → uuid | treat as absent → uuid — **MATCH** |
| A4 | Empty string `""` | length < 1 → null → uuid | uuid — **MATCH** |
| A5 | Whitespace `" "` | regex rejects (0x20) → uuid | uuid — **MATCH** |
| A6 | Unicode (`"ü"`, emoji) | regex rejects → uuid | uuid — **MATCH** |
| A7 | Control/NUL (`"a\u0000"`) | regex rejects → uuid | uuid — **MATCH** |
| A8 | Path traversal (`"../etc/passwd"`) | **KEPT** as the attempt id — `/`, `.`, `_` are all in `[\x21-\x7E]`; it is also accepted as the payment-service `Idempotency-Key` (same charset). Nothing in the flow uses the id as a path → harmless | Opaque id; accepted — **MATCH** (note: no path usage) |
| A9 | `"a".repeat(255)` | KEPT (length 255 ≤ 255) | Valid id accepted — **GAP G2**: the derived payment key `order-<orderId>-<id>` (6+digits+1+255 = 263 with a 1-digit `orderId`) > 255 → payment-service 400 → order-service 503 |
| A10 | `"a".repeat(256)` | length > 255 → null → uuid | uuid — **MATCH** |
| A11 | Array (`["x"]`) | typeof ≠ string → null → uuid | uuid — **MATCH** |

Duplicate attempt ids (`ordersByKey` — flat map keyed by attempt id; the entry stores the verifying email: `ordersByKey.set(attemptId, { email, order })`):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| B1 | Same user, retry after completion | `ordersByKey` hit, `existing.email === email` → **201 with the ORIGINAL order** | 201 same order — **MATCH** |
| B2 | Same user, first request in-flight | `inflightByKey` hit, email matches → `await inflight.promise` → 201 same order | Shared outcome → 201 same order — **MATCH** |
| B3 | Different user, retry after completion | **409** `That purchase attempt is already used.` | 409 — **MATCH** |
| B4 | Different user, first in-flight | `inflight.email !== email` → **409** | 409 — **MATCH** |
| B5 | Same user, **modified body**, same id | Body ignored; returns the ORIGINAL order 201 | Desired: 409 on reuse-with-different-body (payment-service semantics) or new-attempt semantics — **GAP G4** |

Quantities (order-service; identical checks in payment-service and cart-service):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| C1 | `quantity: "5"` (string) | **400** `Quantity must be a whole number between 1 and 99` (`typeof !== 'number'`) | 400 — **MATCH** |
| C2 | `quantity: 5.0` (JSON) | `JSON.parse('5.0')` → `5`; `Number.isInteger(5)` → **accepted as 5** | 5 is in range — accepted — **MATCH** |
| C3 | `1.5`, `99.9` | 400 (not integer) | 400 — **MATCH** |
| C4 | `quantity: 0` | 400 (`qty < 1`) | 400 — **MATCH** |
| C5 | `quantity: -0` / `-0.0` | `Number.isInteger(-0)` = true, but `-0 < 1` = true → **400** | Reject (< 1) — **MATCH** |
| C6 | `quantity: -1` | 400 | 400 — **MATCH** |
| C7 | `quantity: 1e9` | integer, `> 99` → **400** | 400 — **MATCH** |
| C8 | `quantity: 2147483648` (2^31) | integer, `> 99` → **400** | 400 — **MATCH** |
| C9 | `quantity: 1e999` | `JSON.parse` → `Infinity`; `!Number.isInteger(Infinity)` → **400** | 400 — **MATCH** |
| C10 | `true`, `null`, `[1]` | typeof ≠ number → **400** | 400 — **MATCH** |
| C11 | `99` / `100` | 99 accepted; 100 → **400** | 99 in range / 100 rejected — **MATCH** |

Slugs (`SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/` — length 1–64, must start `[a-z0-9]`):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| D1 | `"HOME"` (case variant) | **400** (regex has no uppercase) | 400 — catalog is lowercase — **MATCH** |
| D2 | `"a/b"` (path traversal) | **400** (`/` ∉ regex) | 400 — **MATCH** |
| D3 | `"a.b"` (dots) | **400** (`.` ∉ regex) | 400 — **MATCH** |
| D4 | `"a_b"`, `"a b"` | **400** | 400 — **MATCH** |
| D5 | Unicode (`"á"`) | **400** | 400 — **MATCH** |
| D6 | `""` empty | **400** | 400 — **MATCH** |
| D7 | `"a"×65` | **400** (max 64) | 400 — **MATCH** |
| D8 | `"a"×300` | **400** | 400 — **MATCH** |
| D9 | `"abc-"` (trailing dash) | regex allows; catalog lookup decides (`Unknown product: abc-` if absent) | same — **MATCH** |

Emails (`normalizeEmail`: trim + lowercase, ≤ 254, `^[^\s@]+@[^\s@]+\.[^\s@]+$`) — order, cart, auth, payment metadata:

| # | Input | Current | Desired |
|---|-------|---------|---------|
| E1 | `"user@example.com"` | accepted; stored/compared lowercase | accepted — **MATCH** |
| E2 | `"USER@EXAMPLE.COM"`, `" user@example.com "` | normalized → same account, same idempotency key | match — **MATCH** |
| E3 | `"a@b.com."` (trailing dot) | regex backtracks; `[^\s@]+` matches `"com."` → **accepted** | Reject — minor leniency, **GAP G10** |
| E4 | 255+ chars | null → **400** | 400 — **MATCH** |
| E5 | `""`, whitespace-only, missing | null → **400** | 400 — **MATCH** |
| E6 | `"@x.com"`, `"a@"`, `"a b@x.com"`, `"a@@b.com"` | **400** | 400 — **MATCH** |

`paymentMethod` abuse (order: `Set(['stripe','card','razorpay','upi','bitcoin'])`; payment-service: same list):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| F1 | `"stripe"` etc. | accepted | accepted — **MATCH** |
| F2 | `"Stripe"`, `"stripe,"`, `"stripe "` | **400** (exact match) | 400 — **MATCH** |
| F3 | number / array / null | **400** | 400 — **MATCH** |

Extra body fields on `POST /api/orders` — only `email`, `otp`, `paymentMethod`, `items`, `checkoutAttemptId`, `shippingAddress` are read; the rest are **ignored**:

| # | Input | Current | Desired |
|---|-------|---------|---------|
| G1 | `userId`, `total`, `amount`, `price`, `notes`, `paymentIntentId` posted by client | ignored (server mints intent id; price from catalog; order built from OTP-verified email) | ignored — **MATCH** |
| G2 | `x-user-id` header | stripped by gateway; ignored by order-service | ignored — **MATCH** |

Duplicate JSON keys:

| # | Input | Current | Desired |
|---|-------|---------|---------|
| H1 | `{"paymentMethod":"stripe","paymentMethod":"bitcoin"}` | `JSON.parse` → last wins → `bitcoin` (verified: `JSON.parse('{"a":1,"a":2}')` → `{a: 2}`); client + all services use `JSON.parse` | undefined (standard last-wins); consistent — **MATCH** |

Content-type abuse (`express.json()` on all four):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| I1 | No Content-Type / `text/plain` with JSON body | `body = {}` → order: **400** `A valid email address is required`; payment: **400** `items is required`; cart: **400** `slug must be a catalog-style slug` | body treated as empty — **MATCH** |
| I2 | Malformed JSON (`{oops`) | **400** (body-parser `entity.parse.failed`, status 400; order responds 400 `Invalid request`, payment 400 `Invalid request body`) | 400 — **MATCH** |
| I3 | Array body `[1,2]` | order: 400 `A valid email address is required`; payment: array → `{}` → 400; cart: 400 | rejected — **MATCH** |
| I4 | Empty body | `req.body = {}` → same as I1 | rejected — **MATCH** |
| I5 | > 100 kb | 413 (order: 413 `Request body is too large`; payment/cart: 413 `Invalid request body`) | 413 — **MATCH** |

Same attempt id, first in-flight:

| # | Input | Current | Desired |
|---|-------|---------|---------|
| J1 | Same user, second request while first in-flight | `inflightByKey` → both await the same flow → both **201 same order** (no double charge/double capture) | shared outcome — **MATCH** |
| J2 | Different user, same attempt id, first in-flight | **409** immediately | 409 — **MATCH** |
| J3 | **Payment-service**: two concurrent `POST /api/payments`, same `Idempotency-Key`+body | Both pass the `prior` check (the map entry is written only *after* intent creation; no in-flight map) → **two intents created** | Share the in-flight outcome — **GAP G3** |

Retry with modified body (same key): see **B5** (order-service: silently returns the original order; payment-service: 409 on fingerprint change — inconsistent).

Stock-1 raced by N concurrent different-attempt orders:

| # | Input | Current | Desired |
|---|-------|---------|---------|
| K1 | N orders, different attempt ids, stock = 1 | `reserveStock` check+apply is synchronous inside `runOrder` after `fetchCatalog`; the first order applies `reserved = 1`; every later order sees `1 + qty > 1` → **409 `That item is sold out.`**, no charge, no intent, no stock change. Exactly one winner | one winner, others 409 — **MATCH** |
| K2 | Same race, but one order contains the same slug twice | See Gap G1 — the check is not cumulative across the plan, so the second line also passes and the order is admitted against the last unit | one winner (or 409), never two sales of one unit — **GAP G1** |

Payment-service specifics:

| # | Input | Current | Desired |
|---|-------|---------|---------|
| M1 | `amount` sent by client | **400** `Amount is derived server-side...` | rejected — **MATCH** |
| M2 | Missing/invalid `Idempotency-Key` | **400** | 400 — **MATCH** |
| M3 | Same (email, key), same fingerprint | **200 + original intent** | same — **MATCH** |
| M4 | Same (email, key), different fingerprint | **409** `Idempotency-Key was already used with a different request body` | 409 — **MATCH** |
| M5 | `orderId: [5]` | `String([5])` = `'5'` → passes `^\d{1,20}$` → accepted as orderId `'5'` | minor: arrays coerced — **GAP G9** |
| M6 | `currency: 123` | **400** `currency must be a string` | 400 — **MATCH** |
| M7 | `currency: ""` | falsy → defaults to `USD` | accepted — **MATCH** |

Auth-service `POST /api/register` (spec: caps on `first_name`/`last_name`/`phone` at 254):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| N1 | `first_name` > 254 | **400** `First name must be at most 254 characters` | 400 — **MATCH** |
| N2 | `last_name` / `phone` > 254 | **400** (enforced when non-empty) | 400 — **MATCH** |
| N3 | Numeric `phone` | typeof ≠ string → `''` → allowed | minor: lenient — **note** |

Gateway (`POST /api/orders` through `services/api-gateway`):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| P1 | Any body shape | Pure proxy — no body parsing (malformed bodies reach the order-service); rate tier `/api/orders` write = **5/min/IP** | proxy-only — **MATCH** |
| P2 | Case variants (`/API/ORDERS`) | Express routing is case-insensitive; gateway tier match is case-insensitive too — consistent | match — **MATCH** |

Client — `CheckoutForm.handleSubmit` + `validateCartItems` (`src/components/CheckoutForm.tsx`, `src/lib/cart.ts`):

| # | Input | Current | Desired |
|---|-------|---------|---------|
| Q1 | `checkoutAttemptId` per submit | `crypto.randomUUID()` (satisfies `normalizeAttemptId`); reused after network error; cleared on success; kept on terminal failure | per spec — **MATCH** |
| Q2 | Pre-send `validateCartItems` | `SLUG_RE` + `Number.isInteger(qty) && 1 ≤ qty ≤ 99` per line | same — but **no 20-item / $10k cap pre-check** (server rejects with 400, user sees the message) — **GAP G7** |
| Q3 | `submittingRef` lifecycle | Set `true` before `fetch`; every path that sets it goes through the `finally` that resets it (success/error/network); validation returns happen before the set | no leak — **MATCH** |
| Q4 | Duplicate slugs in client cart | Possible (server cart items are unique per line server-side? — the order service does not dedupe `requested` slugs); server fix G1 covers the double-admission | covered by server — **MATCH after G1** |

---

## Part 2 — Gaps found (with suggested fixes)

### G1 — `reserveStock` double-admits duplicate slugs in one order (order-service) — **present, confirmed by simulation**

The user's hypothesis is correct, with one correction: the apply loop *accumulates*, so the final counter is 2, not "overwritten to 1". Precise behavior with `stock=1` and one order containing two lines of slug `x` with `quantity=1` each:

- Check loop: line 1 → `reserved = 0`, `0 + 1 ≤ 1` → pass; `plan.push`. Line 2 → `reserved = 0` **still** (the map is not updated until after the loop) → `0 + 1 ≤ 1` → pass; `plan.push`.
- Apply loop: `reservedBySlug.set('x', 0 + 1)` = 1; then `set('x', 1 + 1)` = **2** — over the stock of 1.

So the second line should have failed the check (only 1 unit exists), the order is admitted against the last unit, and the reservation counter is left above stock — future orders of that slug then get 409 while `reserved > stock` (no TTL on `reservedBySlug`). There is no "under-reservation" variant in the current code: the apply accumulates, so `reserved` ends at the sum of the lines the lax check admitted.

Simulation of the real code: `BUGGY: 2 lines, stock=1 => admitted: true => reserved = 2`.

**Fix** — make the check cumulative across the plan:

```js
function reserveStock(items) {
  const plan = [];
  const plannedBySlug = new Map();
  for (const it of items) {
    const stock = stockBySlug.get(it.slug);
    if (stock == null) continue;
    const reserved = (reservedBySlug.get(it.slug) || 0) + (plannedBySlug.get(it.slug) || 0);
    if (reserved + it.quantity > stock) return false;
    plannedBySlug.set(it.slug, (plannedBySlug.get(it.slug) || 0) + it.quantity);
    plan.push(it);
  }
  for (const it of plan) {
    reservedBySlug.set(it.slug, (reservedBySlug.get(it.slug) || 0) + it.quantity);
  }
  return true;
}
```

Verified against the real semantics: `stock=1, [1,1] → false`; `stock=2, [1,1] → true, reserved = 2`; release after the stock=2 success → `reserved = 0` (balanced). A failed `reserveStock` (returns false) applies nothing — unchanged behavior.

### G2 — 255-char attempt id overflows the payment-service `Idempotency-Key` (order-service)

`normalizeAttemptId` accepts up to 255 printable chars, but the key handed to the payment service is `order-${orderId}-${attemptId}` = `"order-"` (6) + `String(nextOrderId++)` digits + `"-"` (1) + up to 255 → e.g. length **268** with a small `orderId`. Payment-service requires `^[\x21-\x7E]{1,255}$` → 400 → `runOrder` returns 503. So a spec-valid 255-char attempt id always fails checkout. (Key length = `"order-"` + `orderId` digits + `"-"` + 255 → 263 with a 1-digit `orderId` — over the limit.)

**Fix** — derive the payment key from the attempt id, not the order id (the payment-service fingerprint already excludes `orderId` by design — see the comment in `runOrder`). E.g. `idempotencyKey = \`order-${attemptId}\``, or hash long ids into the key. Same-user retries of the same attempt then collide on the same key and return the original intent — exactly the retry contract.

### G3 — payment-service has no in-flight dedup (J3)

`idempotencyKeys` (email → key → `{fingerprint, intentId}`) is consulted *before* the intent is created, and the entry is written after `paymentIntents.set` — so two concurrent `POST /` with the same key and same fingerprint both pass the check and both create intents (the loser is an uncaptured intent, swept after 15 min).

**Fix** — mirror the order-service: an `inflightByKey` map of `(email, key) → { fingerprint, promise }`; on a hit, compare fingerprints and return the shared outcome.

### G4 — modified-body retry is inconsistent between the two services (B5)

`POST /`: same attempt id + same user + different body → silently returns the **original order** (201). `POST /payments`: same key + different fingerprint → **409**. Desired (uniform): treat reuse-with-a-different-body as a conflict — 409 — or define it as a new attempt. Since the client mints a fresh uuid per submit, a modified-body retry shouldn't happen; the uniform 409 is the safer contract.

### G5 — restart window can double-charge (narrow)

`ordersByKey` / `inflightByKey` / `reservedBySlug` are in-memory; the payment-service idempotency map is not. Crash between a successful `capturePayment` and `orders.push`:

- On retry after restart, `ordersByKey` is empty → new `runOrder` → new `orderId` → new payment key `order-<newId>-<attemptId>`.
- If the original key is found (restart resets `nextOrderId` to 1 — original `orderId` 1) → payment-service returns the succeeded intent → the reconcile path (`intent.status === 'succeeded'`) creates the order **without re-capturing** → OK by accident.
- If keys differ (original `orderId` > 1) → no prior → new intent → `verifyCheckoutOtp` runs — but the original capture already consumed the OTP row → 400 → user re-authenticates and retries the same attempt id → the order is created while the first intent is already captured → **double charge**.

The OTP consumption in `/verify-otp` (row deleted on success) blocks the direct double-charge; the re-auth-and-retry path is the hole.

**Fix** — key the payment-service idempotency by the client retry identity: `idempotencyKey = order-${attemptId}` (G2's key change) — then a retry of the same attempt id hits the same key, the fingerprint matches, and the succeeded intent is returned → reconcile path → no second charge.

### G6 — cart-service merge can exceed the 99 cap (cart-service)

`POST /items` merges duplicates: `existing.quantity += qty` — each add is ≤ 99, but the stored line can become > 99 (e.g. 99 + 1 = 100). Checkout then rejects the order with 400 `Quantity must be a whole number between 1 and 99`, while the cart UI happily shows the line. Note: the storefront client clamps (`cart.add`/`updateQuantity` use `Math.min(MAX_QUANTITY, ...)`), so this is an API-only path.

**Fix** — reject the add when `existing.quantity + qty > 99` (or cap the merge), so the stored line never exceeds the cap.

### G7 — client lacks 20-item / $10k pre-check (client, Q2)

`validateCartItems` checks only slug + quantity. A 21-item cart (server cart allows up to 50 distinct slugs) or a cart over `MAX_ORDER_TOTAL = 10000` passes client validation; the server rejects with 400 and the user sees `Order failed (status 400)`/the server error — a fail-fast client check is the small win.

### G8 — order-service burns an orderId when the order fails at OTP

`getNextOrderId()` is called after `reserveStock` but before OTP verification; an OTP failure (or capture failure after intent creation) leaves the id consumed → cosmetic id gaps in `orders`/`GET /:id` references.

### G9 — payment-service `orderId` accepts arrays (M5)

`orderId = String(body.orderId)` — `String([5])` = `'5'` passes `/^\d{1,20}$/`; reject non-scalar input or require `typeof body.orderId === 'number'`/string.

### G10 — `normalizeEmail` accepts trailing-dot addresses (E3)

`"a@b.com."` matches because `[^\s@]+` matches `"com."`. Reject trailing dots in the regex (`[^\s@]+` → `[^\s@]*[^.\s@]`-style fix) or add an explicit `!email.endsWith('.')` check.

---

## Part 3 — Verified correct (no gaps found)

- **Distinct-order stock race (K1):** `reserveStock`'s check+apply is synchronous within `runOrder` after `fetchCatalog`; two different-order requests serialize on the event loop — the second sees `reserved = 1` and gets 409. One winner, no double charge.
- **`releaseStock` balance:** called once per failure path (intent refuse, amount mismatch, OTP fail, capture fail); each path returns immediately after; on success the reservation is kept (correct). Floor at 0 via `Math.max`.
- **In-flight same-id dedup (order-service, J1/J2):** `inflightByKey` is set synchronously right after `runOrder` starts; a same-user retry awaits the same promise; different-user retry gets 409. The `finally` deletes the inflight entry after completion.
- **Idempotency maps:** order-service `ordersByKey` (flat, keyed by attempt id) and payment-service two-level `idempotencyKeys` (email → key) — no separator-join aliasing possible; `MAX_ORDER_KEYS = 1000` eviction exists.
- **Amount safety:** `AMOUNT_TOLERANCE = 0.005` on the order-service cross-check; `MAX_ORDER_TOTAL = 10000` on both services; payment service rejects any client `amount`.
- **Validation shapes:** quantity checks use `typeof + Number.isInteger + range` in all three services (string/float/huge/negative-zero all rejected); slug shape consistent across order/payment/cart (same `SLUG_RE`); payment-method allowlist consistent (`src/lib/cart.ts` mirrors it); `shippingAddress` is sanitized/truncated to known fields, ≤ 200 chars each.
- **Content-type handling:** `express.json()` on all four services; non-JSON bodies treated as empty; 413 handled with a clean message; error handlers return JSON only.
- **Client double-submit:** `submittingRef` is set before the fetch and always reset in the `finally`; validation paths return before it is set. No leak.
- **Client attempt-id lifecycle (Q1):** `crypto.randomUUID()` per submit (satisfies `normalizeAttemptId`); reused after network error; cleared on success — per spec.
