# Adversarial Review — Checkout Robustness

**Date:** 2026-11-19
**Scope:** (1) Double-charge via retry semantics; (2) stock manipulation / DoS; (3) idempotency forgery & replay; (4) client-side validation gaps; (5) misc correctness (`normalizeAttemptId`, sparse/edge `items`, duplicate slugs, two-phase commit re-check).
**Method:** read of `services/order-service/index.js`, `services/payment-service/index.js`, `services/cart-service/index.js`, `services/auth-service/index.js`, `src/components/CheckoutForm.tsx`, `services/test/checkout-robustness.test.cjs`, `docs/order-robustness.md`, plus adjacent `src/lib/cart.ts`, `services/catalog-service/index.js`, `src/data/products.ts` (trust boundaries, price parity). **Verification:** the existing harness `node services/test/checkout-robustness.test.cjs` — **31/31 green**; plus a probe battery I wrote (`adversarial-probe.cjs`, run under the same scaffold: real catalog/payment/order, stub auth) — **all pass**; findings below cite it as **[P1]–[P7]**.

---

## Attack 1 — Double-charge

### 1.1 Retry with the same attempt id after a terminal error / lost response — **SAFE (verified)**

*How it works:* the client (`CheckoutForm.tsx`) generates `submitAttemptRef.current ?? crypto.randomUUID()` and **keeps** it on both the error path (`setErrorMessage(...)`) and the network-error path; it clears it only on success. The server answers the retry from `ordersByKey` (line 377–384): same email → `201 { order }` — the original order, no re-flow, no second capture. Concurrent retries share via `inflightByKey` (lines 385–391).

*Verified:* harness **B2** (same id → same order id, exactly one order, **B3**), harness **C1** (two concurrent same-id POSTs → same order), probe **[P5b/P5c]** (retry same id → 201; same id again → same order).

*Why a second charge is impossible on this path:* the payment-service `/capture` is the only thing that sets an intent `succeeded`, and it returns `400` on an already-captured intent (`payment-service/index.js:304-306`). Order-service captures at most once per `runOrder`, and `runOrder` runs at most once per attempt id (ordersByKey + inflightByKey are both checked before any charge path).

### 1.2 Double-click / two rapid Pay clicks — **SAFE (verified)**

Client: `submittingRef` guard at line 291, set before the fetch, reset in `finally` — leak-free on every return path. Server: `inflightByKey` — "a double-click cannot create two orders or double-capture" (payment-service in-flight dedup is the two-level map). Harness **C1**, probe **[P1/P7]**.

### 1.3 Two tabs submitting — **two purchases, user-initiated (not a bug)**

Each tab has its own ref → different attempt ids → two orders. This is a user paying twice; nothing enforces "one purchase per cart" across tabs — by design the attempt id is per-tab. Minor UX note: in the real auth, tab B's `send-otp` deletes all rows for (email, purpose) (`auth-service/index.js:682`), so tab B invalidates tab A's live code and tab A's Pay returns 400 "Invalid or expired verification code". That is an availability/UX wart, not money.

### 1.4 "User completes checkout twice" — **two purchases, user-initiated (not a bug)**

After success the client clears the ref, so a re-submit after the success screen gets a fresh attempt id → a new purchase. The only way to get the same purchase charged twice is to bypass the form and re-POST the same attempt id — the server returns the same order (1.1). **No automated "completes twice" path exists.**

### 1.5 The residual the task asked me to document — **R1: capture-succeeded-but-push-lost + user re-pays = possible double charge (MEDIUM, requires user action)**

*How it would work:* `capturePayment` succeeds (money moves), then the order push is lost/fails — a crash between capture and `ordersByKey.set`, or the capture response lost (payment-service sets `succeeded` then responds; if that response is lost, order-service throws). Retry semantics:

- **Same attempt id, same session (client kept the ref):** `ordersByKey` has no entry (push never happened) → re-runs `runOrder` → `createPaymentIntent` with a **new** `orderId` (`getNextOrderId()` never repeats in-process) → **new key** → payment-service creates a **new intent** → then `verifyCheckoutOtp(email, otp)` → the OTP row was **deleted on the first attempt's verify** (`auth-service/index.js:753`) → **400, no second charge**. So the common window is closed by OTP consumption.
- **New attempt id (e.g., user refreshed the page and re-pays):** same story — new intent → OTP consumed → 400. Still closed.
- **The residual:** after the error, the user naturally re-requests the OTP and clicks Pay again — that is a **new attempt id** (ref was lost on refresh, or the user re-submits from a fresh page) and a **new intent + new capture**. The first charge already moved; the user now pays twice while believing the second was needed. **Reachable, but only with user action after an ambiguous error.** The reconcile path was supposed to cover it ("crash between capture and the order push") — see 1.6.

Note the test stub does **not** model OTP consumption (`services/test/checkout-robustness.test.cjs:84` accepts any `GOOD` OTP repeatedly), so this residual is untested by the suite. Honest summary: **no automated double-charge; one documented user-action window.**

### 1.6 The reconcile path (`intent.status === 'succeeded'`, order-service `runOrder` line 476-481) — **dormant in-process (observation)**

The comment says it exists for "an earlier attempt already captured this intent (crash between capture and the order push)". But for it to fire, `createPaymentIntent` must return an intent with `status === 'succeeded'`, and the payment-service only creates intents with `requires_capture` — it returns the prior succeeded intent only on a **key match** (`payment-service/index.js:225-231`). The key is `order-${orderId}-${attemptId}` (line 448) and `getNextOrderId()` (line 247-251) is a monotonically increasing module counter — **the same key cannot recur in-process**. After a restart both `paymentIntents` and `ordersByKey` are empty, so no prior is found. Net: the reconcile is currently a harmless safety net, not a reachable path. No action needed; worth knowing if someone later adds durable state.

### 1.7 Payment-service F2 (in-flight double-create of a key, masked by order-service) — **accepted (already documented in the plan)**

payment-service has no in-flight dedup between the prior-check and the map set (the window includes `await getCatalogPrices()`). Direct internal callers reusing a key concurrently could create two intents; the second overwrite does not capture twice (capture is once-only). Masked by order-service `inflightByKey`. No double charge possible through the only caller.

---

## Attack 2 — Stock manipulation / DoS

### 2.1 Buy the last item twice — **SAFE (verified)**

`reserveStock` (lines 273-292) is two-phase synchronous: the plan map accumulates per-slug **within** the order (`claimed` is added to the running `reserved` when checking the next line), commits only when everything fits, in one event-loop turn — atomic on the single-threaded store. Re-check of the earlier two-phase bug: stock=1 + `[{slug,1},{slug,1}]` → 409; stock=2 + `[1,1]` → admitted, reserved=2. Verified in-harness **D1/D2** and probe **[P6/P6b]** (stock-1 `arcwise-template`, one order with a duplicated slug line → 409; the product is still buyable afterwards → no leaked reservation).

### 2.2 Can a product be made to appear sold out (DoS)? — **no in-process leak**

Every path after a successful `reserveStock` in `runOrder` releases (or converts to an order):

| Path | Release? |
|---|---|
| `createPaymentIntent` throw (line 460-464) | `releaseStock` ✓ |
| Amount mismatch (line 470-474) | `releaseStock` ✓ |
| OTP invalid (line 489-493) | `releaseStock` ✓ |
| `capturePayment` throw (line 495-501) | `releaseStock` ✓ |
| Success / reconcile | kept (the product is genuinely sold) ✓ |
| `reserveStock` false (line 445) | nothing was committed ✓ |

No error path after reserve returns without release. Accepted limits: a crash **between** reserve and any release strands the reservation (worst case: product appears sold out until manual release) — documented in `docs/order-robustness.md` §5.3; and restart loses `reservedBySlug` (all state is in-memory — the whole service accepts this).

### 2.3 `releaseStock` clamp (`Math.max(0, ...)`, line 298) — **minor wart, not exploitable**

A double-release clamps at 0. In-process, releases are one-per-error-path with no duplicates, so the clamp is defensive only. If a double-release ever became reachable, the failure mode is "product appears sold out while another reservation exists" (availability, not integrity) — still, `Math.max` masks the bug instead of making it visible. Not exploitable as-is.

### 2.4 `stockBySlug` staleness — **accepted**

`fetchCatalog` replaces `stockBySlug` per call but not `reservedBySlug`; if the catalog changed stock, reservations could exceed. The catalog is static (code change + `scripts/check-catalog.mjs` parity check). Accepted per the plan.

---

## Attack 3 — Idempotency forgery / replay

### 3.1 Replay another user's attempt id — **SAFE (verified)**

POST / with user B's `checkoutAttemptId` while user A has an order on it: `existing` found, `existing.email !== email` → **409** (line 383). Concurrent → `inflight.email !== email` → 409 (line 387). Harness **F1**, probe **[P7/P7b]**. Replaying someone else's id buys nothing and returns nothing of theirs (GET / requires a verified session and the owner filter at line 554).

### 3.2 Attempt-id guessing — **SAFE (reasoned)**

Server-side `normalizeAttemptId` (lines 262-268): 1–128 chars of printable ASCII, `^[\x21-\x7E]+$`. The client sends `crypto.randomUUID()` (v4, 122 random bits) — not guessable. Even if guessed, forging only risks a 409, not money: the existing-order path returns **before any OTP verification or capture**.

### 3.3 Attempt-id replay after a *failed* attempt — **SAFE**

`ordersByKey` only holds successes; a failed attempt's id is free to retry (re-runs the flow). If the first failed **before** capture, no charge happened.

### 3.4 Forged `paymentIntentId` / money / identity fields in the order body — **SAFE (verified)**

All client-owned fields except slug+quantity are server-owned: `paymentIntentId`, `userId`, `total`, `price`, `email`, `otp` are read from the body for validation but the stored order is built from catalog + OTP (lines 505-525). Harness **F2** (`total: 0, paymentIntentId: 'forged', userId: 'admin'` → 201, `total === 24`, `paymentIntentId` is the server's own). Probe **[P4]**: extra item fields ignored, catalog price used.

### 3.5 Residual: id state is in-memory

A refresh loses the client attempt id; `ordersByKey`/`orders` are in-memory. The accepted mitigation for a refresh-after-response-loss is that `notifyCustomer` sends a receipt after a successful push (so a user who sees a success-after-error already has proof of an order). If the user is unlucky (refresh while the flow was mid-flight), they can re-pay a purchase that hasn't been pushed — a new purchase; the user action decides.

---

## Attack 4 — Client-side validation gaps

### 4.1 `validateCartItems` (CheckoutForm.tsx:20-24) — **no gaps found**

`items.every(SLUG_RE && Number.isInteger(qty) && 1 ≤ qty ≤ 99)`. Mirrors the server's checks; server is the gate anyway. Note: `validateCartItems` doesn't pre-check the 20-item cap or the $10k ceiling — the server 400s with a clear message (plan's "G7 — accepted").

### 4.2 `crypto.randomUUID()` availability — **minor wart (reasoned)**

No `try/catch` around `crypto.randomUUID()` in `handleSubmit` (line 303). It exists in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+); if it ever didn't, the submit would die silently (unhandled rejection, no `errorMessage` set). A tiny `try { crypto.randomUUID() } catch { crypto.randomValues(...) }` fallback or a guarded inline would close it.

### 4.3 `submittingRef` — **leak-free (verified)**

Set at line 305 before the `try`; reset in `finally` (line 345) — every return path in between goes through `finally`. Guard at line 291.

### 4.4 Two-tab OTP race — **UX wart, not money (see 1.3)**

### 4.5 Edge battery extras — **all pass [P1–P3, P5, P7]**

- `checkoutAttemptId: null` → server generates (line 372: `normalizeAttemptId(null) || crypto.randomUUID()`), id echoed.
- `items: [null, {...}]` (sparse/null entries over JSON) → 400 (`!item` at line 348).
- `items: [{slug, quantity: 0.5}]` → 400 (`Number.isInteger` at line 358).
- Extra item fields ignored; catalog price used.
- Retry-with-same-id after a bad-OTP terminal failure → 201, and a re-POST of the same id returns the same order (the "kept on terminal failure" semantics work both ways).

---

## Attack 5 — Misc correctness

- `normalizeAttemptId` battery (harness **E**): `''`, numeric, 256 chars, control chars — all 400. `A2`: 128-char id accepted (fits the payment-service 255-char key).
- **Duplicate slugs in one order against limited stock** — the earlier F1 bug class: fixed, re-verified by probe **[P6/P6b]** and harness **G1/G2** (all 20 concurrent unlimited orders → distinct ids).
- **Stock-1 product sold twice sequentially**: after a successful buy of `arcwise-template`, the next order → 409 (harness **D2**, probe **P6b** shows the failed duplicate doesn't burn the product).
- `releaseStock` balance: reserved equals held on every path (see 2.2 table).
- Payment-service `/capture`: shape-checked, idempotent (400 if already captured) — internal only (not proxied by the gateway), reachable only by order-service.
- `ordersByKey` FIFO eviction at 1000: a retry of an *evicted* successful attempt id re-runs the flow → new purchase — needs 1000+ orders and a retry of an old id; acceptable, note-only.
- `notifyCustomer` fire-and-forget: its failures are logged and swallowed; it never affects the order (harness runs it against a dead port).
- **Reconcile path**: dormant in-process (see 1.6).

---

## Verdict

**No critical issues. No automated double-charge exists in the implemented flows; the double-charge risk reduces to one documented, user-action-dependent window (1.5).** Stock is not manipulable into a false "sold out" or into double-buying in-process; the two-phase commit is correct. Idempotency forgery returns only 409s or the caller's own order. The client gaps found are minor warts (UUID fallback, no item/total pre-checks, two-tab OTP UX).

### Suggested fixes (prioritized)

1. **1.5 (R1) — close the residual double-charge window:** make the OTP gate re-reachable after a capture-without-push by persisting the OTP through capture, or have order-service check `paymentIntents`/re-verify on retry when the order is missing. Also consider notifying the user of a "charged but not ordered" state on capture-without-push (receipt outbox is a bigger change — plan §9.1).
2. **4.2 —** wrap `crypto.randomUUID()` with a `crypto.getRandomValues` fallback in `handleSubmit`.
3. **2.3 —** turn the `Math.max(0, ...)` in `releaseStock` into a logged assertion (or drop the clamp and let it go negative to expose the bug).
4. **Document:** reconcile path dormancy (1.6) and the in-memory id-state limitation (3.5) as accepted limitations.

---

## Verification log

- `node services/test/checkout-robustness.test.cjs` → **31/31 green** (A0–A2, B1–B4, C1, D1–D2, 17×E, F1–F2, G1–G2).
- Probe battery (`adversarial-probe.cjs`, same scaffold as the harness): **P1–P7 all pass** (null attempt id, 0.5 quantity, null item entries, extra-field stripping, bad-OTP→retry, cross-user replay 409).
