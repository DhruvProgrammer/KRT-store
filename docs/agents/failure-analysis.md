# Checkout Failure Analysis — KRT Store

Scope: `services/order-service/index.js`, `services/payment-service/index.js`,
`services/auth-service/index.js`, `src/components/CheckoutForm.tsx`, `services/api-gateway/index.js`.

## 1. Flow as it runs today (trace)

1. `POST /api/orders` → gateway proxies to order-service (`api-gateway/index.js:215-220`; rate limit 5/min/IP, `:121`).
2. Order-service validates (`order-service/index.js:258-293`).
3. `fetchCatalog()` → 503 `Pricing is temporarily unavailable, please try again` on failure (`:299-305`). Prices come from the catalog service only (`:80-90`).
4. Compute items+total, `MAX_ORDER_TOTAL` check (`:307-327`).
5. `createPaymentIntent()` → `POST payment-service/` with `Idempotency-Key: order-<orderId>-<uuid>` (`:353-375`). Payment-service validates, checks its `idempotencyKeys` map (`email:key`), creates an intent `{id, amount, status:'requires_capture'}` in the **in-memory** `paymentIntents` Map, returns 201 (`payment-service/index.js:216-272`).
6. Amount compare: order total vs `intent.amount`, tolerance 0.005 (`:380-384`); mismatch → 400.
7. `verifyCheckoutOtp()` → `POST auth-service/verify-otp`. Auth-service consumes the code: it **deletes the otps row** on success (`auth-service/index.js:753`). Fail → 400 (`order-service/index.js:392-395`).
8. `capturePayment()` → `POST payment-service/capture` → sets `pi.status='succeeded'` (`payment-service/index.js:296-297`). Order-service: any failure → 503 `Payment could not be completed, please try again` (`:397-402`). Note: capture on an already-succeeded intent returns 400 `Payment already captured` (`payment-service/index.js:292-294`) — order-service has no GET-intent route.
9. `orders.push(order)` → `notifyCustomer(order)` (fire-and-forget; try/catch logs, never retries) → `201 {order}` (`order-service/index.js:424-426`, `:200-235`).

State inventory (all in-memory except OTP rows): `orders` (order-service `:238`), `paymentIntents` + `idempotencyKeys` (payment-service `:42-46`), OTP rows (auth-service SQLite — the only durable store). Order-service also has no GET route to discover a lost order (GET / and GET /:id are session-gated).

---

## 2. Failure-mode table

| # | Window | What happens today (consequence) | What should happen | Mitigation | Client-side semantics |
|---|--------|----------------------------------|--------------------|-----------|----------------------|
| **a** | Crash after intent created, before capture | Intent sits in `paymentIntents` (in-memory). If the crash is after step 7, the OTP is already consumed. **No charge.** Client: error/timeout; cart retained; if OTP consumed, user must resend code. | Retry returns/captures the **same** intent — a new attempt is not needed. Uncaptured intents expire and release stock. | Server: **deterministic idempotency key** per (customer, cart): on `POST /`, if an uncaptured intent exists for the key → capture it instead of creating a new one. Payment-service: **durable** `paymentIntents`+`idempotencyKeys` (persist to disk on write); TTL sweep releases stock for uncaptured intents. | On retryable 5xx, auto-retry POST with the same checkout token (≤3, ~1-2s apart) instead of "try again" by hand. |
| **b** | Crash after capture succeeded, before order pushed | **Money charged** (`status:'succeeded'` in memory). No order. If order-service restarted, `orders` is empty. Client: error/timeout → user re-pays → **new intent + new capture = DOUBLE CHARGE**. | On retry, create the order from the already-succeeded intent — never re-capture. | Server: on `POST /`, resolve the deterministic key; if intent is `succeeded` → skip capture, push order. Durable orders table. Client: token-based dedupe. | Retry returns the same order → success screen, no second payment. |
| **c** | Crash after order pushed (or browser error after push) | Order in `orders` (in-memory). Crash → **order lost**. Client sees error; re-pay → double charge. Even without crash: any browser-side failure after the server pushed → re-pay → double charge. | Client retry returns the **SAME order** (idempotent) → user sees success, not a second payment. | Server: durable orders table; client mints `checkoutToken`, sends it in the POST body; server: `orders.checkout_token UNIQUE`; duplicate token → return existing order (201). | On network error/timeout: "Reconnecting your order…" state; re-POST with same token; on response, show success. |
| **d** | OTP consumed but order not created (e.g., capture fails) | 503 `Payment could not be completed, please try again`. OTP row deleted (must resend). Uncaptured intent abandoned (TTL 15 min; sweep at `payment-service/index.js:57-74`). Risk: if the capture actually succeeded but the response was lost → windows (b)/(h). | Retry reconciles: GET intent; if succeeded → create order; else retry capture idempotently; **never requires a second OTP**. | Server: on capture failure → (i) `GET /intents/:id`; if `succeeded` → create order; (ii) else retry capture once after short delay; (iii) else 503. Move OTP consumption **after** the order is durably pushed (or rely on token dedupe). Payment-service: add `GET /intents/:id`. Client: on this error, retry-with-token; show actionable message. | Show "Payment couldn't be completed — check your email for a new code" if OTP invalid; retry token first; resend button on invalid-code. |
| **e** | Catalog outage mid-checkout | Before OTP: 503 `Pricing is temporarily unavailable, please try again`; nothing burned. After order-service's snapshot: payment-service 503 → order-service 503. Two independent fetches (`order-service/index.js:81`, `payment-service/index.js:84`) can drift → 400 `The order total could not be verified, please try again`. | Single pricing source or retry the capture on mismatch. | Server: on mismatch, retry capture once after ~1-2s. Client: auto-retry with token (the intent exists; mismatch may clear). | Today's messages are fine; keep "retry" semantics. |
| **f** | Payment-service restart between intent and capture (maps lost) | `paymentIntents`/`idempotencyKeys` are in-memory → lost. `capture` → 404 `Payment intent not found` → 503. If restarted **after** capture succeeded → (b): charged, no order, double-charge risk on retry. | Durable maps; restart-safe reconcile: on `POST /`, if a succeeded intent exists for the deterministic key → create the order. | Payment-service: persist `paymentIntents` + `idempotencyKeys` to a JSON file (or SQLite; better-sqlite3 already used in auth-service) on write + periodic flush. Order-service: `GET /intents/:id` (new route) to reconcile. | Same as (b): token retry → server returns existing order. |
| **g** | Notification failure (order paid, receipt lost) | `notifyCustomer` fire-and-forget; errors only logged; 201 already sent. Customer sees success; **receipt may never arrive**. If they re-submit: OTP consumed → resend → pay again → **double charge**. | Receipt delivery decoupled + retried; user told the order is placed regardless of receipt outcome. | Durable outbox: table (email, payload, attempts, next_retry) in order-service DB; worker retries with backoff (5m→1h→give up + log). Or sync-notify-with-bounded-timeout before responding. | Success screen: "Order confirmed — receipt sent to your email (check spam)". Keep `recordLocalOrder`. |
| **h** | Browser response lost (double-charge window) | Money moves at capture; response lost; OTP consumed; client sees "Network connection failed". Re-pay → **double charge**. Today there is no way for the client to know whether an order exists. | Idempotent retry by token; client auto-retries. | Client: mint `checkoutToken` (uuid4) at submit start; persist in localStorage; send in POST body; retry with same token ≤3×; server dedupes. Server: `orders.checkout_token UNIQUE`, duplicate → 201 same order. | Auto-retry on network error; show "Reconnecting your order…"; if server returns the order → success screen. |
| **i** | Stock reserved, then crash (permanent sold-out until manual release) | Today: **nothing is reserved** — grep finds no `stock` field; cart-service doesn't deduct; order-service doesn't reserve. Oversold possible today (two customers buy the last unit). If reservation is added, orphans risk permanent sold-out. | Reserve at intent creation (payment-service); release on uncaptured sweep; `POST /reservations/release` for manual/ops; allocated → never auto-released. | Payment-service: `reservations` map/table: `slug → {available, reserved, allocated, intentId}`; on intent creation: `available -= qty`, reservation tied to intent. TTL sweep: if intent `!== 'succeeded'` and expired → release + audit-log orphan. On capture: mark `reserved → allocated`. | n/a (client semantics unchanged — the UI already shows a static "In stock" label in CartList.tsx). |

---

## 3. Cross-cutting mitigations (server, by need)

1. **Durable orders** — replace in-memory `orders` with SQLite (better-sqlite3, already a dep of auth-service) or a JSON file. Write the order at push time; reload on boot. (Also fixes: order-service restart currently wipes orders — GET / returns `[]`.)
2. **Idempotent create (client token)** — kills (c) and (h): server dedupes on `checkout_token` before doing anything money-related.
3. **Reconcile-on-retry** — before creating anything, resolve: (1) order by `checkout_token` → return; (2) intent by deterministic key via `GET /intents/:id` → `succeeded` → create order; `requires_capture` → capture → create order. This fixes (a), (b), (d), (f).
4. **Outbox for receipts** — fixes (g): durable + retried notifications independent of the order path.
5. **Late OTP consume** — alternative fix for (d)/(a): order the steps as intent → compare → capture → push → verify OTP → respond. With token dedupe as the safety net (a replayed code + retry token returns the existing order).
6. **Payment-service durability** — persist `paymentIntents`, `idempotencyKeys`, and the new `stock`/reservations to disk (fixes (f)). Real-systems note already in code: Stripe is the source of truth — a GET by key against the provider is another option when one exists.
7. **Capture-failure handling** — GET intent; if succeeded → create order; else retry capture once after delay (fixes (b)/(d)).
8. **TTL sweep releases stock** — payment-service sweep (`:57-74`) already deletes uncaptured intents after 15 min; extend it to release reservations and audit-log orphans (fixes the tail of (i)).

Deterministic key construction: `sha256(email + '|' + sorted(items))` — customer-scoped (payment-service already scopes `idempotencyKeys` by email), cart-scoped, restart-stable (unlike the current per-attempt UUID).

---

## 4. Client-side semantics (`CheckoutForm.tsx`)

Today:
- Success: `recordLocalOrder(order, email, items.length, total)` → localStorage `dg-orders` (read by `AdminPanel.tsx:334`), `clear()` cart, `setSubmitted(true)` → "Order confirmed (demo)" screen.
- `!res.ok`: red error = `data.error || 'Order failed (status N)'`.
- Network error: "Network connection failed: <msg>".
- Cart retained on failure; manual "Resend code" for OTP.

Should:
- Mint `checkoutToken` (uuid4) at submit start; store in localStorage (`dg-checkout-token`); include it in the POST body.
- Auto-retry POST with the same token on network error/timeout: ≤3 attempts, ~1s then ~2s apart; show "Reconnecting your order…" while retrying.
- On 503 `Payment could not be completed`: retry-with-token first; if server returns the existing order → success.
- On success: receipt note ("check spam if you don't see it"); keep cart-clearing behavior as-is.

---

## 5. Priorities

1. **Client token + server dedupe** — kills the (c)/(h) double-charge window.
2. **Durable orders** — kills order loss in (c).
3. **Payment-service durable maps** — kills (f) double charge.
4. **Capture-failure reconcile + order** — fixes (b)/(d).
5. **Outbox for receipts** — fixes (g).
6. **Stock reservation + sweep release + release endpoint** — fixes (i).
