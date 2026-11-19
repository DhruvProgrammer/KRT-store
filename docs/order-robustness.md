# Order Robustness — Validation, Idempotent Payment Retries, and Last-Item Race Safety

Repo: `C:\Users\MR.PC\Desktop\wp-bot\design-goods` — KRT Store (Astro storefront + Node.js microservices)
Date: 2026-11-19
Branch: `main` → pushed to GitHub `DhruvProgrammer/KRT-store` (one file per commit, then `git push origin main`)

## TL;DR

| Ask | Design |
|---|---|
| **1. Validation — never trust client input** | Close the gaps at every ingress: `cart-service` (slug charset + quantity cap), `auth-service` (field length caps), `CheckoutForm`/`cart.ts` (pre-flight validation). The server-side rules are already strong; the browser adds defense-in-depth. |
| **2. Idempotency — retrying a payment must not charge twice** | Browser generates a `checkoutAttemptId` per purchase attempt (kept across network-error retries, cleared on success). `order-service` dedups on it (`ordersByKey` + in-flight map → a retry of the same attempt returns the same order). payment-service fingerprint excludes the churning `orderId`. Already-captured intents reconcile into an order without re-capturing. |
| **3. Race safety — two people can't buy the last item at once** | New optional `stock` on catalog products (`arcwise-template: 1` seeded). `order-service` does an atomic synchronous `reserveStock`/`releaseStock` — the store is single-threaded, so a synchronous critical section is atomic. Concurrent different-attempt buyers: one wins, the other gets 409. |

---

## 1. System context

Flow (verified against the code):

```
browser CheckoutForm ──► gateway :3001 (public hop: CORS allowlist, per-IP rate tiers)
      ──► order-service :3005  ←── payment-service :3006 (direct, server-to-server; not proxied)
              │                        └── catalog-service :3003 (the pricing source of truth)
              ├── auth-service :3002   └── payment-service captures (the money moves here)
              └── notification-service :8000 (mailer, internal-only)
```

Server-verified invariants today (see `services/order-service/index.js`):

- Owner = the address the server verified with the OTP (`verify-otp` consumes the code).
- Price/name/total = catalog prices, computed server-side; the posted `total`, `price`, `userId`, `paymentIntentId` are ignored.
- The order is created only after `capturePayment` returns success.

---

## 2. Findings per ask (current state)

### 2.1 Validation — never trust client input

| Ingress | Validated today | Gaps |
|---|---|---|
| `order-service` POST / | email regex; OTP string; `paymentMethod` allowlist; items 1–20, `SLUG_RE` slugs, quantity whole 1–99; total ≤ $10,000; `shippingAddress` sanitized to fixed keys/200 chars | new: `checkoutAttemptId` validation |
| `payment-service` POST /, /capture | rejects client `amount`; requires `Idempotency-Key`; currency allowlist; metadata key/value allowlist; email required; slug/quantity checks; total ceiling | — |
| `cart-service` POST /items, PUT/DELETE /items/:slug | slug: only `typeof === 'string'`; quantity: whole ≥ 1 (no cap); per-line price/name come from catalog | slug charset; quantity cap at 99 (order-service caps at 99, the cart does not — a cart line of 1e9 is accepted and only fails at checkout) |
| `auth-service` register | email normalized+regex; password 8–128 + blocklist; `first_name` required | `first_name`/`last_name`/`phone` length (stored free text) |
| Browser `CheckoutForm` + `cart.ts` | email regex, OTP length, client quantities clamped 1–99 | pre-flight validation of cart items before sending (defense-in-depth) |

### 2.2 Idempotency — retrying a payment must not charge twice

Root causes today (traced through `services/order-service/index.js`):

1. Every POST mints a fresh `orderId` and a fresh payment-service `Idempotency-Key` (`order-${orderId}-${randomUUID()}`) — so a retry of the same purchase can never be recognized as such.
2. payment-service dedups only on exact key+body; the fingerprint includes `orderId`, which churns per attempt.
3. The browser has no retry semantics: a double-click or a lost response → new flow → new intent → second capture.

Failure window today: response lost after `capturePayment` → retry → new intent + second capture = double charge.

### 2.3 Race safety — last item

Today there is **no stock concept** (grep: no `stock`/`inventory` fields in the catalog or `src/data/products.ts`; "In stock" in `CartList.tsx` is hardcoded copy). The machinery is built for "two people can't buy the last item once it exists":

- The store is single-process per service (Node). `order-service` runs one event loop.
- Design: `reserveStock(items)` — a synchronous check-then-decrement in one event-loop turn (atomic by construction); `releaseStock(items)` on every failure path after the reservation.

---

## 3. Web research

Environment note: the `websearch` tool returns no results in this environment; `webfetch` works.

- **Stripe API reference — `POST /v1/payment_intents/create`** ([docs.stripe.com/api/payment_intents/create](https://docs.stripe.com/api/payment_intents/create)): server-side intents; `Idempotency-Key` is the standard header for retry safety.
- **Wikipedia — Idempotence**: "a customer request for placing an order is typically not idempotent since multiple requests will lead to multiple orders being placed" — the reason client+server idempotency keys are needed. HTTP `POST` "does not need to be" idempotent; safe retries require server idempotency.
- **Wikipedia — Compare-and-Set**: atomic check-and-set; CAS + retry is the standard pattern for counters/counters-style updates.
- **Wikipedia — Optimistic Concurrency Control**: validates before commit; used by Redis `WATCH`, DynamoDB conditional updates, DBMSs with OCC; HTTP `ETag`/`If-Match` is the classic web OCC mechanism.
- Payment idempotency search queries (`websearch`) returned no results in this environment; the design below follows the canonical pattern (client-generated attempt id, server-side dedup map, fingerprint-on-request, reconcile-on-already-captured).

---

## 4. Agent findings

Spawned in parallel as background subagents, each with a named responsibility:

| Agent | Report | Responsibility |
|---|---|---|
| architecture | `docs/agents/architecture.md` | flow trace, trust boundaries, where validation lives, where the attempt id + stock plug in |
| correctness | `docs/agents/correctness.md` | line-by-line audit of the money path; failure windows; double-charge scenarios |
| edge-cases | `docs/agents/edge-cases.md` | malformed-input table across all ingress points |
| security | `docs/agents/security.md` | threats: double-charge, stock abuse, idempotency forgery, capture reachability |
| performance | `docs/agents/performance.md` | resource growth: new maps, existing unbounded maps, hot paths |
| ux | `docs/agents/ux.md` | client-side UX of the retry/idempotency + validation changes |
| failure-analysis | `docs/agents/failure-analysis.md` | crash windows + mitigations + client-side semantics |
| adversarial (final) | `docs/agents/adversarial.md` | post-implementation skeptical attack of the implemented design |

**Key confirmations from the reports:**
- **Architecture**: the money path is exactly as §1 describes (validate → catalog price → intent → compare ±0.005 → OTP → capture → push). Plug-in points: `ordersByKey`/`inflight` dedup on `POST /api/orders`; payment-service `Idempotency-Key` = the client attempt id (already scoped by email, `payment-service/index.js:216`); stock in `order-service`.
- **Failure-analysis** (reproduces the double-charge window today): (b) capture-then-crash-before-push, (h) response lost, (c) error-after-push — all let a retry pay twice, because OTP is consumed before capture and state is in-memory. Also: payment-service restart loses `paymentIntents`/`idempotencyKeys` maps; receipts are fire-and-forget. Its priority list matches this design's scope: client-token + server dedupe kills (c)/(h); durable orders/payment maps/receipt outbox/stock-sweep-release are documented follow-ups beyond the three asks (I verify that their "reconcile-on-retry" (fix a/b/d/f) is covered — by the `intent.status === 'succeeded'` reconcile path — but durable state and the receipt outbox are NOT in this change set).
- **UX**: same double-pay story from the user side; recommends the exact client semantics I planned (`useRef` id, generate after validation, clear on terminal failure/success, keep on network error, double-submit guard), pre-send slug/quantity validation, "sold out" UX mapping, generic error fallbacks.

---

## 5. Design

### 5.1 Validation

**Client (`src/components/CheckoutForm.tsx`, `src/lib/cart.ts`) — defense in depth:**

- Mirror the server slug regex client-side; validate cart items before sending (`SLUG_RE`, quantity 1..99).
- Generate `checkoutAttemptId` per submit; double-submit guard; retry semantics (§5.2).

**Server — hard rules (unchanged, plus the new field):**

| Service | Rule |
|---|---|
| `order-service` | + `checkoutAttemptId`: printable ASCII 1–255 (client sends a uuid v4; server generates one if absent). Validation happens before dedup, so a forged retry of a *failed* attempt still re-runs the flow. |
| `payment-service` | unchanged (already rejects client `amount`, requires `Idempotency-Key`) |
| `cart-service` | **new:** slug must match `^[a-z0-9][a-z0-9-]{0,63}$` (same as order-service); quantity: whole number 1..99 on POST and on PUT (was: ≥ 1, uncapped) |
| `auth-service` | **new:** `first_name` 1–254 (required anyway), `last_name` ≤ 254, `phone` ≤ 254 (all trimmed strings, stored only) |
| gateway | unchanged (validates nothing — the backends are the trust boundary) |

### 5.2 Idempotency

**Client (`CheckoutForm.tsx`):**

```ts
// REUSE order: the ref (in-flight/retry), then the localStorage record
// (a reload reuses it — the server returns the same order if the first
// attempt landed; a stored id for a different email is not this user's
// attempt), then a fresh uuid. Written to storage on submit, cleared on
// success. The ref is cleared on success.
const emailKey = email.trim().toLowerCase();
const storedAttempt = readStoredAttempt();
const attemptId =
  submitAttemptRef.current ??
  (storedAttempt && storedAttempt.email === emailKey ? storedAttempt.id : null) ??
  crypto.randomUUID();
submitAttemptRef.current = attemptId;
writeStoredAttempt({ email: emailKey, id: attemptId });

// guard: if (submitting) return; + disabled button while submitting

const res = await fetch(`${API_URL}/api/orders`, { body: JSON.stringify({
  email: emailKey, otp,
  items: items.map((i) => ({ slug: i.slug, quantity: i.quantity })),
  paymentMethod,
  checkoutAttemptId: attemptId
}) });
if (res.ok && data?.order) {
  submitAttemptRef.current = null;   // success: next Pay = new attempt
  clearStoredAttempt();
  ...success UI...
} else {
  // terminal failure OR network error — KEEP the attempt id:
  // a re-click retries the same purchase; the server returns the same
  // order if the first one actually landed.
}
```

Semantics: the attempt id identifies a purchase attempt until it succeeds. A re-click after any failure reuses the id — if the server actually succeeded (response lost), the retry returns the same order; if it didn't, the flow re-runs. A page reload reuses the id from localStorage (`dg-checkout-attempt`, `{email, id}`) — same retry semantics. A stored id for a different email is not this user's attempt (defensive 409-clear on the server's 409 response).

**Server (`services/order-service/index.js`):**

```
POST /:
  validate email/otp/paymentMethod/items (existing)
  attemptId = valid(body.checkoutAttemptId) || crypto.randomUUID()
  existing = ordersByKey.get(attemptId)
    → same email  → 201 { order: existing.order }        // the retry contract
    → other email → 409 { error: 'That purchase attempt is already used.' }
  inflight = inflightByKey.get(attemptId)
    → same email  → await inflight.promise → same result (dedup concurrent retries)
    → other email → 409
  flow = runOrder(...)            // idempotencyKey = `order-${orderId}-${attemptId}`
  inflightByKey.set(attemptId, { email, promise: flow })
```

```
runOrder(...):
  catalog = await fetchCatalog()                    // stock seeded here
  items/total/ceiling checks
  if (!reserveStock(items)) return 409 'That item is sold out.'
  intent = createPaymentIntent(...)
  compare totals → on mismatch: releaseStock; 400
  if (intent.status === 'succeeded') {
    // RECONCILE: an earlier attempt already captured this intent (crash
    // between capture and order push). The money already moved; do NOT
    // capture again and do NOT re-verify the OTP — it was consumed by
    // that attempt.
  } else {
    verifyCheckoutOtp → on fail: releaseStock; 400
    capturePayment → on fail: releaseStock; 503
  }
  push order; ordersByKey.set(attemptId, { email, order }); notifyCustomer
```

**payment-service:** fingerprint = `{ items, currency, metadata }` — `orderId` removed (it churned per attempt; the key is the identity). A same-key retry returns the same intent (`200`).

### 5.3 Stock reservation (last item)

```js
// catalog-service: `arcwise-template` gets `stock: 1` (src/data/products.ts mirrors it)
// order-service:
let stockBySlug = new Map();          // slug → integer stock, or null = unlimited (seeded in fetchCatalog)
const reservedBySlug = new Map();     // slug → quantity reserved by open (unconfirmed) orders

function reserveStock(items) {
  // Two-phase, synchronous: the store is single-threaded, so the check and the
  // decrement happen in one event-loop turn — a last item cannot be claimed by
  // two concurrent checkouts. Returns false WITHOUT reserving anything if any
  // line does not fit.
  const plan = [];
  for (const it of items) {
    const stock = stockBySlug.get(it.slug);
    if (stock == null) continue;
    const reserved = reservedBySlug.get(it.slug) || 0;
    if (reserved + it.quantity > stock) return false;
    plan.push(it);
  }
  for (const it of plan) reservedBySlug.set(it.slug, (reservedBySlug.get(it.slug) || 0) + it.quantity);
  return true;
}
function releaseStock(items) {
  for (const it of items) {
    const stock = stockBySlug.get(it.slug);
    if (stock == null) continue;
    reservedBySlug.set(it.slug, Math.max(0, (reservedBySlug.get(it.slug) || 0) - it.quantity));
  }
}
```

Reservation placement: after total ceiling checks, **before** the intent is created — a sold-out cart fails with 409 and no dead intents; released on: intent-create failure, total-mismatch, OTP failure, capture failure. Reservation kept when the order is created (or reconciled).

Known limits (documented, not hidden): restart of order-service loses `reservedBySlug` (accepted; orders are in-memory anyway); a crash between reserve and any release strands the reservation (worst case: a product appears sold out until manual release).

---

## 6. Implementation plan

| Phase | Files | Verify |
|---|---|---|
| 1 | `services/order-service/index.js` — `normalizeAttemptId`, `ordersByKey`, `inflightByKey`, `runOrder`, `reserveStock`/`releaseStock`, stock seeding in `fetchCatalog` | `node services/order-service/selftest.cjs` green |
| 2 | `services/payment-service/index.js` — fingerprint excludes `orderId`; reconcile-on-succeeded handled in order-service | `node services/payment-service/selftest.cjs` green |
| 3 | `services/cart-service/index.js` — `SLUG_RE` + quantity ≤ 99 | `node services/cart-service/selftest.cjs` green |
| 4 | `services/auth-service/index.js` — field length caps in `/register` | `node services/auth-service/trust-proxy.test.cjs` green + auth-security suite green |
| 5 | `src/components/CheckoutForm.tsx` — attempt id + double-submit guard + item validation; `src/lib/cart.ts` — slug regex | typecheck/build; UX report |
| 6 | `services/catalog-service/index.js` + `src/data/products.ts` — `arcwise-template.stock = 1`; `scripts/check-catalog.mjs` — stock parity check | `node scripts/check-catalog.mjs` green |
| 7 | New `services/test/checkout-robustness.test.cjs` + extended selftests | all green (see §7) |

---

## 7. Test plan

### 7.1 `services/test/checkout-robustness.test.cjs` (NEW — integration harness)

Real `order-service` + real `payment-service` + real `catalog-service` (ports 3520–3522), stub `auth-service` (port 3523, accepts OTP `123456`), dead notification port. Scenarios:

- **A. Normal** — valid order → 201, paid, catalog price, `checkoutAttemptId` echoed; a missing attempt id → 201 (server-generated); a 128-char attempt id → 201 (fits the payment-service key).
- **B. Retry after response loss** — POST twice with the same attempt id → same order id; `GET /` list length 1; a NEW attempt id → new order (new purchase allowed).
- **C. Concurrent same attempt id** — `Promise.all` of two identical POSTs → both 201, same order id; list length 1.
- **D. Last-item race** — two concurrent POSTs for `arcwise-template` (stock 1, different attempt ids, different emails) → statuses exactly {201, 409}; third attempt → 409.
- **E. Validation battery** (all expect 400): missing email, missing otp, invalid email, bad payment method, empty items, unknown slug, quantity 0/−1/1.5/100/"5", slug traversal, >20 items, attempt id empty string, attempt id as number, attempt id 256 chars, attempt id with a control char.
- **F. Adversarial** — user B reuses user A's attempt id → 409; client-supplied money fields (`total: 0`, `paymentIntentId: 'forged'`, `userId`) ignored (order uses catalog values).
- **G. Stress** — 20 concurrent orders of unlimited product → all 201, 20 distinct order ids.

### 7.2 Extended selftests (pre-existing, updated in place)

- `services/order-service/selftest.cjs` — new: sold-out concurrency test (finite-widget stock 1, two concurrent different-attempt buyers → exactly one 201, other 409, third → 409); attempt-id retry returns same order; concurrent same-attempt retries return the same order.
- `services/payment-service/selftest.cjs` — new: fingerprint excludes `orderId` (same key + body, different orderId → same intent, 200).
- `services/cart-service/selftest.cjs` — new: slug traversal → 400; slug with invalid chars → 400; quantity 100 → 400; quantity 0 → 400; PUT quantity 100 → 400.

### 7.3 Existing suites must stay green

`npm run test:security` (order/payment/cart selftests, gateway limiter + trust-proxy tests, auth suite, CSP + catalog checks).

---

## 8. Verification log

All suites green after implementation (2026-11-19):

- `node services/order-service/selftest.cjs` — 48 passed (new: attempt-id retry / concurrent retries / cross-user 409 / new attempt; last-item race: exactly one winner)
- `node services/payment-service/selftest.cjs` — 27 passed (new: fingerprint ignores `orderId`)
- `node services/cart-service/selftest.cjs` — 24 passed (new: slug/quantity validation)
- `node services/test/checkout-robustness.test.cjs` — 31 passed (A0–A2 normal; B1–B4 retry-after-response-loss; C1 concurrent same-attempt; D1–D2 last-item race; 17× E validation; F1–F2 adversarial; G1–G2 stress)
- `npm run test:security` — order 48 + payment 27 + cart 24 + auth trust-proxy 3 + gateway rate-limit + gateway trust-proxy + auth-security 146 + CSP drift checks + catalog parity check (12 products, stock parity ok) — all green
- `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` — clean (client changes typecheck)

## 9. Adversarial log

Agent reports: `docs/agents/{architecture,correctness,edge-cases,security,performance,ux,failure-analysis}.md` (7 specialized parallel subagents); the dedicated post-implementation adversarial review is appended in 9.5.

### 9.1 Correctness agent (docs/agents/correctness.md)

- **(Fixed) F1** — duplicate slugs in one order bypassed the stock check (the check loop read the un-updated `reserved` value; the apply loop accumulated). `reserveStock` now accumulates per-slug within the order (the `plan` map) and commits once — verified: stock=1 + lines [1,1] → refused; stock=2 + [1,1] → admitted, reserved=2.
- **(Accepted follow-up) F2** — payment-service has no in-flight dedup between the prior check and the map set (the window includes `await getCatalogPrices()`): two concurrent same-key POSTs can create two intents (the second overwrites the first). Masked by the order-service `inflightByKey` (the browser flow is the only source of keys). Direct internal callers reusing a key concurrently: no double charge (capture is once-only; the abandoned intent is TTL-cleaned).
- **(Accepted) F3** — the amount compare runs before the `succeeded` check: a succeeded intent that mismatches the catalog-derived total takes release + 400. Rare catalog-drift edge; acceptable.
- **(Accepted) F5** — `stockBySlug` is replaced per `fetchCatalog`, `reservedBySlug` is not (stale reservations if a product's stock changed). Catalog is static (only changed via code); accepted.
- All selftest invariants preserved: same-attempt retry returns the same order without re-verify; 409 for cross-user replay; inflight dedup; the reconcile path is reachable; no order without a captured payment; distinct keys per attempt; the failure-mode tests are unchanged and green.

### 9.2 Edge-cases agent (docs/agents/edge-cases.md)

- **(Fixed) G1** — confirmed on the pre-fix code (two lines of the same slug admitted against stock 1, over-reservation). Fixed per 9.1/F1.
- **(Fixed) G2** — a spec-valid 255-char `checkoutAttemptId` overflowed the payment-service Idempotency-Key (`order-<id>-<id>` > 255) → 503 at checkout. The contract is now 1–128 (verified: A2, a 128-char id is accepted).
- **(Fixed) G6** — the cart merge (`existing.quantity += qty`) could exceed 99 when merging repeated adds; now clamped to `MAX_QUANTITY` (mirrors the client's `add()`).
- **(Accepted) G3** — payment-service in-flight double-create (see 9.1/F2).
- **(Accepted) G4** — modified-body retry: the order-service returns the original order (dedup first); the payment-service 409s a different body — consistent enough; the order-service dedup runs before any payment call.
- **(Accepted follow-up) G5** — restart window: both services restart between capture and the push → a new intent + second charge is possible (in-memory state; the single-service-restart case is covered by the reconcile path). Known limitation, documented.
- **(Noted) G7** — the client lacks 20-item/$10k pre-checks: the server is the gate and the error messages already surface; a UX nicety — accepted.
- **(Noted) G9** — payment-service accepts `orderId: [5]` → `'5'` (stored only; no money impact) — accepted.
- **(Noted) G10** — trailing-dot emails are accepted by the loose regex (pre-existing; `ISSUES.md` already flagged the loose-regex class).
- Verified-correct categories: distinct-order stock race serializes (one winner, others 409); `releaseStock` balance; in-flight dedup (both services); quantity/slug/email/paymentMethod shapes; duplicate JSON keys (last-wins, consistent); content-type abuse (non-JSON → 400s, >100kb → 413); gateway proxy behavior; the client's `submittingRef` is leak-free on all return paths.

### 9.3 Security agent (docs/agents/security.md)

14 threats reviewed — double-charge (mitigated by design: once-only capture + idempotency), capture reachability (payment-service not proxied), foreign-intent capture (impossible — the client cannot set `paymentIntentId`; amount compared to the catalog total ±0.005), OTP brute force (bounded: 5/code, 5/min per-recipient, 10/min per-IP+email), notification relay (the committed token was rotated per `DEPLOYMENT-SECURITY.md` §1 — operator note), CSP/HSTS/gateway exposure — all verified.

- **(FIXED)** the payment-service idempotency map used an ambiguous `${email}:${key}` join (a colon in either could alias two customers' keys — "a:b:c" collisions). Now a two-level `email -> key` map — no string join.
- **(FIXED)** `docker-compose.yml` didn't set `AUTH_SERVICE_URL` for the cart-service → in Docker its session lookup 404s → 401 on all cart routes. Added.

### 9.4 Performance agent (docs/agents/performance.md) — follow-ups (out of the three asks)

- `fetchCatalog` per order (order-service, and the same pattern in payment/cart): pre-existing; add a 60s TTL cache when convenient.
- `orders[]` is unbounded (like the rest of the in-memory state); `ordersByKey` is capped (1000, FIFO). Restart-safe by design.
- The payment-service keeps captured intents in `paymentIntents` — bounded by orders; fine.
- New-code performance: `reserveStock` is synchronous (no contention on the single-threaded loop); the new maps are bounded like `ordersByKey`.

### 9.5 Final adversarial review — `docs/agents/adversarial.md` (session `ses_e0b84e007ffe1FTgTa8O6HaWF2`)

**Verdict: no critical issues. No automated double-charge exists in the implemented flows.**

- **Double-charge (double-check)**: same-attempt retries dedup (`ordersByKey` — same order returned, no payment calls); concurrent retries share the inflight promise; the OTP is consumed *before* capture (`auth-service/index.js:753` — the row is deleted on verify), so a retry after capture cannot re-run the flow. Probes P1–P5 pass; harness B2/C1 green.
- **Residual (MEDIUM, user-action-dependent, R1)** — "user refreshes the page after a successful capture but before seeing the response, then pays again": the new attempt id would create a second intent while the user believes their first charge went through. **Closed by the final pass**: the client persists the attempt id in `localStorage` (`dg-checkout-attempt`, `{email, id}`) on submit; a reload reuses it, and the server returns the same order — the same code path as harness B2/C1 (POST with the same attempt id → same order, no second capture). A stored id for a different email is treated as not-ours (new attempt; the server also clears the stored id if the client receives its 409).
- **Stock**: `reserveStock` two-phase commit verified — the duplicate-slug case (stock=1 + lines [1,1]) → refused (probe P6/P6b); every post-reserve path either releases or creates a real order; no DoS leak. The `Math.max(0, …)` clamp in `releaseStock` is a wart, not exploitable.
- **Forgery/replay**: cross-user replay of an attempt id → 409 (probe P7); forged `paymentIntentId`/`total`/`userId` ignored (harness F2); client-supplied money never read.
- **Client gaps (minor, not money)**: `crypto.randomUUID()` without a fallback; two-tab OTP race (different tabs → different attempt ids → the user pays twice — user-action-dependent, accepted); no client-side pre-checks for the 20-item/$10k ceilings (server is the gate).

## 10. Commit log (one file per commit, in this order; then `git push origin main`)

| # | File | Message |
|---|------|---------|
| 1 | docs/agents/architecture.md | docs: agent report — checkout flow trace + trust boundaries |
| 2 | docs/agents/correctness.md | docs: agent report — money-path correctness audit |
| 3 | docs/agents/edge-cases.md | docs: agent report — edge-case table across ingress points |
| 4 | docs/agents/security.md | docs: agent report — security review (14 threats) |
| 5 | docs/agents/performance.md | docs: agent report — resource growth + hot paths |
| 6 | docs/agents/ux.md | docs: agent report — client-side UX of retry/idempotency + validation |
| 7 | docs/agents/failure-analysis.md | docs: agent report — crash windows + mitigations |
| 8 | docs/order-robustness.md | docs: order robustness plan (validation, idempotent retries, last-item race) |
| 9 | services/order-service/index.js | feat(order): idempotent checkout attempts + atomic stock reservation |
| 10 | services/payment-service/index.js | fix(payment): fingerprint excludes churning orderId; two-level idempotency map |
| 11 | services/cart-service/index.js | fix(cart): slug charset + quantity caps (incl. merge clamp) |
| 12 | services/auth-service/index.js | fix(auth): length caps on stored free text in /register |
| 13 | src/components/CheckoutForm.tsx | feat(checkout): client-generated checkoutAttemptId + double-submit guard |
| 14 | src/lib/cart.ts | fix(cart): mirror the server slug charset in validateItem |
| 15 | services/catalog-service/index.js | feat(catalog): arcwise-template stock: 1 |
| 16 | src/data/products.ts | feat(products): stock field + arcwise-template stock: 1 |
| 17 | scripts/check-catalog.mjs | feat(check): stock parity check between storefront and catalogue |
| 18 | docker-compose.yml | fix(deploy): AUTH_SERVICE_URL for the cart-service |
| 19 | services/order-service/selftest.cjs | test(order): attempt-id idempotency + last-item race checks |
| 20 | services/payment-service/selftest.cjs | test(payment): fingerprint ignores orderId |
| 21 | services/cart-service/selftest.cjs | test(cart): slug/quantity validation checks |
| 22 | services/test/checkout-robustness.test.cjs | test(checkout): robustness harness — normal/edge/stress/adversarial |
| 23 | docs/agents/adversarial.md | docs: adversarial review of the implemented design |
