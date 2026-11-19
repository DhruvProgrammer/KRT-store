# Correctness audit — order/payment checkout flow (new implementation)

**Scope:** `services/order-service/index.js` (POST `/`, `runOrder`, `reserveStock`/`releaseStock`, `fetchCatalog`, `ordersByKey`, `inflightByKey`) and `services/payment-service/index.js` (idempotency map, sweeps).
**Method:** static trace of questions (1)–(7) plus the selftest invariants; both selftests run green (order-service 39/39, payment-service 26/26); a repro of `reserveStock` at `C:\Users\MR.PC\AppData\Local\Temp\opencode\dup-slug-repro.cjs` (scratch, not in the repo).
**No service changes were made.**

---

## (1) Same attempt id, retry, same email — `ordersByKey` hit (order-service/index.js:361–366)

Returns **the same order** (`201`) with the original order object. The retry path makes **no payment calls and no second charge** — it returns before `runOrder` is ever entered.

**OTP:** not re-verified, and nothing needs it. The original attempt ran `verifyCheckoutOtp` before capture, so the code is already consumed and the order already exists. Retrying without an OTP returns the same order.

Note (low severity): the attempt id is client-chosen — the server accepts any string of 1–255 printable-ASCII chars (`normalizeAttemptId`, line 257–261) or mints a uuid. Anyone who knows an attempt id can replay it and read back the order body (email, items, total, intent id). Treat the attempt id as a replay bearer for that purchase; the per-email `ordersByKey` check (`existing.email === email`) is the only identity check on the retry path.

## (2) Same attempt id, different email — the 409 path (line 361–367)

`existing.email !== email` → **409 `That purchase attempt is already used.`** — a different user replaying the id never gets someone else's order. The inflight variant is the same: `inflight.email !== email` → 409 (line 371).

## (3) Inflight retry (same / different email) — line 369–375

- **Same email:** `await inflight.promise` → the **same order** (`201`) when the flow succeeded, or the **original error** when it failed (e.g. 400 OTP, 409 sold-out, 503 payment).
- **Different email:** 409 immediately.
- After a failed flow, nothing is recorded: `ordersByKey.set` only happens on success (line 514), and `inflightByKey.delete` runs in the handler's `finally` (line 384). So a retry of the same attempt id starts a **fresh flow** — new `orderId`, new `Idempotency-Key`.

## (4) The reconcile path — `intent.status === 'succeeded'` (line 460–465)

**When it triggers.** Single-process it is essentially dead code: `createPaymentIntent` always gets `requires_capture` back — the payment service only sets `succeeded` inside `/capture` (payment-service/index.js:272, 308). It becomes reachable when:

1. **Restart + same attempt id:** pre-restart the flow created intent `order-1-X`, captured it, pushed the order; the restart wipes the in-memory `ordersByKey`; the retry re-enters `runOrder`, `getNextOrderId()` mints `1` again, key `order-1-X` → payment service returns the prior **succeeded** intent via its idempotency dedup (fingerprint matches: same items/currency/metadata; `orderId` is excluded from the fingerprint by design — see `payment-service/index.js:214–219`).
2. **Multi-process orderId collision:** two order-service processes both start `nextOrderId` at 1, both mint `order-1-X` for the same attempt id, both call the payment service; the second POST gets the prior succeeded intent.

**Is the OTP right?** Yes by design: the branch performs **no OTP verification and no capture** — the money already moved and the prior attempt consumed the code. The payment service's idempotency map is email-scoped (`scope = email`, line 183), so the prior entry belongs to the same normalized email the retry presents (order-service `normalizeEmail` = trim+lowercase; payment service uses the same rule on `metadata.email`). Creating the order from a succeeded intent is the intended semantics ("reconcile").

**Not a bug.** One caveat in §(6).

## (5) `reserveStock` / `releaseStock` correctness

**Double-release:** no path. Every failure path (`createPaymentIntent` fail line 446; amount-mismatch line 456; OTP-fail line 475; capture-fail line 483) calls `releaseStock` once and returns immediately; the success path releases nothing. `releaseStock` also clamps with `Math.max(0, …)` (line 288), so a stray double-call can't go negative.

**Double-reserve:** no path. `reserveStock` is two-phase — a check loop then a decrement loop, both synchronous within the event loop (lines 266–282). Two concurrent checkouts cannot both pass the last item. **But: F1 below — duplicate slugs inside one order bypass the check.**

**Winner's flow fails after reserve:** `releaseStock` runs on all four failure paths above and nothing is recorded (`ordersByKey` unset, `inflightByKey` deleted in `finally`). Retry of the same attempt id → fresh flow → new `orderId` → new `Idempotency-Key` → new intent → the OTP is verified again — note the OTP was consumed pre-capture in the failed flow, so a **capture failure burns the code** (user requests a new code; retrying the same attempt id with it works). This matches the pre-existing documented behavior (`docs/agents/security.md`: "Valid code + failed capture → code already consumed; user must re-request") — not a regression, but worth knowing.

**F1 (medium — logic bug, confirmed):** `reserveStock`'s check phase reads `reserved` fresh per line without accumulating within the batch (line 274), while the reserve phase sums correctly (line 279). An order with **two lines of the same slug** therefore passes the check against a stale base and then reserves the sum:

```
repro: reserve [a:1, a:2] on stock 2 -> true
       reservedBySlug[a] = 3   (stock is 2)   → over-reserved
fixed: reserve [a:1, a:2] on stock 2 -> false (check now accumulates)
fixed: reserve [a:1, a:1] on stock 2 -> true,  reserved = 2
```

Impact: subsequent buyers of that slug see less than the catalog stock → false "sold out"; drift grows by the duplicate sum per offending order. **No money/payment invariant breaks** — the order still creates and captures; it's stock accounting only.

**F5 (low, note):** `fetchCatalog` replaces `stockBySlug` on every fetch (line 91) but `reservedBySlug` is never replaced. If the catalog drops a product, its reservation is invisible while absent and double-counts when it returns (and nothing ever decrements that stale entry). Static-catalog assumption (documented) makes this low.

## (6) The `intent.status === 'succeeded'` branch — is `releaseStock` wrongly called on it?

No. The branch itself releases nothing: it skips OTP + capture and falls through to create the order (line 488–517) with `status: 'paid'`.

One caveat (low): the amount compare (line 453–458) runs **before** the status check. On a genuinely succeeded intent whose computed `total` disagrees with `intent.amount` beyond `AMOUNT_TOLERANCE`, the flow takes the mismatch path — `releaseStock` + 400 — on an intent that was already captured (multi-process + catalog drift scenario). Effects: no order is created, but money has moved with no order attached (the same ambiguity class as a lost capture response). Suggestion: check `intent.status === 'succeeded'` **before** the amount compare (reconcile is the right outcome there; the amount check applies only to the capture path).

## (7) Payment service two-level map (`idempotencyKeys: email -> Map<key, {fingerprint, intentId}>`, lines 49, 223–231, 277–283, 60–77)

- **Lookup:** `idempotencyKeys.get(email).get(key)` — per-email scope; no string-join aliasing.
- **Same key + different body → 409** (fingerprint compare, line 226–228). Fingerprint = `JSON.stringify({ items: sortedBySlug, currency, metadata })` with metadata rebuilt in fixed key order — deterministic; `orderId` intentionally excluded (per-attempt idempotency would turn legitimate retries into 409s).
- **Set:** only after a new intent is created — `paymentIntents.set` then `mapForEmail.set(key, {fingerprint, intentId})`; creates the per-email map if missing.
- **200-with-prior path:** returns the prior intent when the fingerprint matches and the intent still exists.
- **Sweeps (every 60 s):** intents TTL 15 min — deletes non-succeeded intents older than the cutoff; `idempotencyKeys` sweep deletes a key when its intent is gone (`!pi`) or the intent is non-succeeded and timed out. **Succeeded intents and their keys are retained forever** in both maps — consistent (replays of captured orders keep returning the intent).
- **Gap (F2):** there is **no in-flight marker**. Two concurrent POSTs with the same `(email, key)` both pass the `prior` check while the first is between the check and `mapForEmail.set` (there is `await getCatalogPrices()` in between, line 235) → both create intents; the second `mapForEmail.set` overwrites the first → double-create, and if both get captured, double charge. **Today it is masked by the order service:** key = `order-${orderId}-${attemptId}`; one flow per attempt id per process (`inflightByKey`), and different attempt ids → different order ids → different keys. **Reachable via:** multi-process order services sharing an attempt id (order ids restart at 1 → same key `order-1-X`), or direct callers of the payment API. Suggest: write a "processing" entry to the idempotency map before `await getCatalogPrices()` (or a processing status), like Stripe.

---

## Selftest invariant check (both suites green: order-service 39/39, payment-service 26/26)

**(a) "a failed payment does not burn the verification code"** — **preserved.** The selftest's scenarios (payment unreachable, payment 503, wrong amount) all fail **before** `verifyCheckoutOtp` in the new flow — the OTP is verified after intent creation, amount compare, and the succeeded check. Verified by run: `a failed payment does not burn the verification code` → ok. Nuance (unchanged from the old flow): a **capture** failure burns the code (verify precedes capture); the reconcile branch consumes nothing.

**(b) "no order without a captured payment"** — **preserved.** Orders are pushed only after `capturePayment` succeeds (line 480) or after a succeeded-status intent (payment service sets `succeeded` only via `/capture`). Green checks: `the intent was captured before the order was created`, `no failed attempt captured a payment`, `the failed attempts left no order behind`.

**(c) "every attempt gets its own Idempotency-Key"** — **preserved.** Key = `order-${orderId}-${attemptId}`; per-process order ids are unique (`getNextOrderId`), so distinct flows get distinct keys; retries of the same attempt id reuse the key by design. Green: `every order attempt sent its own Idempotency-Key`. Caveat: process restart resets `nextOrderId` → possible cross-process key reuse (ties to F2).

---

## Findings summary

| # | Severity | Finding |
|---|----------|---------|
| F1 | Medium (logic) | `reserveStock`: duplicate slugs in one order bypass the check → **over-reservation** past catalog stock (repro: stock 2, lines [a:1, a:2] → reserved 3). No money invariant broken. |
| F2 | Low–medium (robustness) | Payment service: no in-flight marker for same-key POSTs → double-create possible via multi-process/direct calls. Masked today by the order service's per-process `inflightByKey`. |
| F3 | Low (semantics) | Amount compare runs before the reconcile branch → a succeeded intent that mismatches the order total takes the `releaseStock` + 400 path (money already moved, no order). Suggest reorder. |
| F4 | Low (note) | `ordersByKey` retry returns the order without OTP; the client-chosen attempt id is a replay bearer for the order body. |
| F5 | Low (note) | `reservedBySlug` not cleared when `stockBySlug` is refreshed on catalog change → stale reservations on re-added products (static catalog). |

## Suggested fixes

- **F1:** accumulate per-slug reservations inside the check loop (the fix shape in the repro is verified: `[a:1,a:2]` → false, `[a:1,a:1]` → true, reserved = 2).
- **F2:** insert a pending entry into `idempotencyKeys` before the catalog `await`; resolve it to the created intent after.
- **F3:** move the `intent.status === 'succeeded'` branch above the amount compare; apply the amount check only on the capture path.
- **F4 (hardening):** bind the replay key to `(attemptId, email, …)` or re-check something server-owned on the retry; optionally re-verify OTP on the ordersByKey retry path if a "replay needs to re-prove" UX is desired — current behavior is a safe idempotent replay.

## Re-check after fixes

```
node services/order-service/selftest.cjs   # expect 39 passed, 0 failed
node services/payment-service/selftest.cjs # expect 26 passed, 0 failed
```

Optional new selftest coverage: an order with two lines of the same slug on a stock-1 product (F1) — expect no order, no reservation, and a later buyer of the slug to succeed.
