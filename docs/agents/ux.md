# UX review — client-side checkout flow (KRT storefront)

**Scope.** Reviewed against the planned changes and the code as read:
`src/components/CheckoutForm.tsx`, `src/components/CartList.tsx`, `src/lib/cart.ts`,
`src/data/policy.ts`, `src/components/OtpInput.tsx`, plus server grounding in
`services/order-service/index.js`, `services/auth-service/index.js`, and
`services/payment-service/index.js`.

**Style of this review:** findings are UX/flow observations — messages a user sees,
guards, and paths — backed by the code; server-side facts are cited where they change
what the client can do (sold-out detection, idempotency).

---

## 1. `checkoutAttemptId` — idempotent order creation

### Current state

- `handleSubmit` (`CheckoutForm.tsx:263-315`): on success → `recordLocalOrder` +
  `clear()` + `setSubmitted(true)`; on `!res.ok || !data?.order` → `setErrorMessage`;
  on fetch throw → `"Network connection failed: …"` (line 311).
- Today the only double-submit guard is `disabled={loading}` on the Pay button
  (`CheckoutForm.tsx:453`). That covers most double-clicks, but nothing covers
  *click → network error → click again*: two clicks on the same logical attempt.

### Findings

1. **The client half of the plan is sound as specified.** Generate-if-null at submit
   start + clear on terminal failure gives: a new id per logical attempt, reused id
   across network-error retries. Store it in a `useRef` (not state) so re-renders
   during the request don't matter, and generate it **after** the client-side checks
   pass (a failed email/OTP validation should not mint an id).
2. **The server half is missing — the guard is inert without it.** There is no
   `checkoutAttemptId`/idempotency handling in `POST /api/orders` (grep over
   `services/order-service` finds none; every POST makes a new `orderId` and a new
   idempotency key at `order-service/index.js:353-360`). The payment service's own
   idempotency is keyed by `(email, key)` (`payment-service/index.js:216,271`) with a
   per-POST random key — so two POSTs today create two orders and two charged
   intents. **Recommendation (server):** accept optional `checkoutAttemptId` in
   `POST /api/orders`; store it on the order; look it up after field validation
   (before `getNextOrderId()`); if found, return the existing order as a normal
   201. On a replay, skip the OTP re-verify (the code was consumed by the first
   attempt — `verifyCheckoutOtp` runs at `order-service/index.js:392`, before
   capture at 398) and skip creating a new intent.
3. **Add a second, explicit double-submit guard.** A `submittingRef`: set `true` at
   submit start, `false` in `finally`; return early if already true. Covers the gap
   in finding 1 and any timing race. Keep `disabled={loading}` too.
4. **Clear on terminal failure, keep on network error.** Clear the id when any
   response comes back with `!res.ok` (400/404/503 — the user retries with a fresh id,
   since a previous attempt created nothing or nothing charged) and on success. Keep
   it only when the fetch itself threw (network error — the ambiguity the id exists
   for).

### Recommended client sketch

```ts
const attemptIdRef = useRef<string | null>(null);
const submittingRef = useRef(false);

// in handleSubmit, after validation passes:
if (submittingRef.current) return;
submittingRef.current = true;
const attemptId = (attemptIdRef.current ??= crypto.randomUUID());
try {
  const res = await fetch(`${API_URL}/api/orders`, { ...,
    body: JSON.stringify({ ..., checkoutAttemptId: attemptId }) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.order) {
    attemptIdRef.current = null;          // terminal failure → fresh id next time
    setErrorMessage(data?.error || "…");
    return;
  }
  attemptIdRef.current = null;            // success → fresh id next time
  …success path…
} catch {
  // network error: attemptIdRef stays set → retry reuses it
  setErrorMessage("Network connection failed…");
} finally {
  submittingRef.current = false;
  setLoading(false);
}
```

### UX effect

Today: click Pay → slow/lost response → click again → risk of a second order and a
second charge. With this change: the retry reuses the id; with server support the
user gets the original order back and the success screen. Net UX gain: no double pay
on retry. Small addition: while a retry is in flight the button reads "Placing
order…" again instead of looking dead — already implied by keeping it disabled.

---

## 2. Client-side validation of cart items before sending

### Current state

- `validateItem` (`cart.ts:64-77`) blocks invalid items **at write time**: non-empty
  slug, quantity 1..99, price ≥ 0, etc.
- Server re-validates: `SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/`
  (`order-service/index.js:44`); quantity must be an integer 1..99
  (`order-service/index.js:289-291`, with `MAX_QUANTITY = 99` at line 46); max items
  per order (line 273).

### Findings

1. **There is a slug-charset gap.** `validateItem` accepts *any non-empty string* as a
   slug (`cart.ts:67`); the server's `SLUG_RE` is stricter (lowercase alphanumeric
   start, ≤64 chars). Today an item with an invalid slug reaches the user only as a
   raw 400 at submit time, *after* email + OTP + payment setup:
   `Each item needs a valid slug` (`order-service/index.js:283-284`).
2. **Quantity is already double-enforced** — the stepper and `updateQuantity` clamp
   to 1..99 (`CartList.tsx:45-46,61,65`; `cart.ts:137`). The server check stays the
   backstop for tampered/stale storage.

### Recommendation

In `handleSubmit`, before the POST:

```ts
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/; // mirrors services/order-service/index.js:44
if (!items.every(i => SLUG_RE.test(i.slug) && Number.isInteger(i.quantity) &&
                 i.quantity >= 1 && i.quantity <= 99)) {
  setErrorMessage("Some items in your cart can't be purchased. Remove them and add them again.");
  return;
}
```

Actionable message (tells the user what to do), catches the issue at click time.

---

## 3. Sold-out UX — "That item is sold out." with a Continue-shopping path

### Current state

- Server: `POST /api/orders` → `catalog.get(slug)` miss → `400 Unknown product: <slug>`
  (`order-service/index.js:310-312`). The catalog has **no stock field** — grep finds
  no `stock`/`soldOut`/`sold_out` anywhere in `services/catalog-service` or the data
  files. There is nothing to read stock from; detection is by catalog absence.
- Client today: `setErrorMessage("Unknown product: foo")` — an internal-sounding
  string in the red banner above the Pay button (`CheckoutForm.tsx:302-303`).

### Findings

1. The message exists, but "Unknown product: foo" leaks a server concept; the plan's
   "That item is sold out." is customer-facing and names the problem.
2. **The Continue-shopping path is cheap.** The client can detect the sold-out case
   from the server message: `/^Unknown product: (.+)$/.exec(data?.error)` → find the
   cart item by slug → render a sold-out panel.

### Recommendation

New state `soldOutSlug: string | null`. In `handleSubmit`, on `!res.ok`:

```ts
const soldOut = /^Unknown product: (.+)$/.exec(data?.error ?? "");
if (soldOut) { setSoldOutSlug(soldOut[1]); return; }
```

New `SoldOutPanel` branch (before the main form), styled like the success branch:
- Headline: **"That item is sold out."**
- Item name if the slug is still in the cart (it usually is — the server rejects at
  order time), e.g. *"Get Started (Premium) is sold out."*
- CTA `<Button href="/store/">Continue shopping</Button>` (the same "Continue
  shopping" wording used elsewhere: success screen `CheckoutForm.tsx:237`,
  `CartList.tsx:157`).
- Attempt id cleared; the form never sent, so nothing to undo.

### UX note (not changed here)

`CartList.tsx:99` statically says "In stock · Instant download" for every line. That's
misleading if an item is sold out, but fixing it needs a stock signal the catalog
doesn't have. Flag as a follow-up when the catalog can carry stock.

---

## 4. Error message quality

### Findings (today's messages, in rough order of severity)

1. **Status-code fallback leaks internals.** `setErrorMessage(data?.error || \`Order
   failed (status ${res.status})\`)` (`CheckoutForm.tsx:303`) — a user sees
   "Order failed (status 401)" or "(status 503)". Unactionable.
2. **Network errors read as "Failed to fetch."** The network catch uses
   `err.message` verbatim (line 311); `TypeError: Failed to fetch` is what browsers
   throw, and it doesn't tell the user what to do.
3. **Server messages that reach the user are decent** — call them out as the good
   ones, since they should be the standard to copy:
   - `Invalid or expired verification code` (auth-service `INVALID_CODE`, line 141)
   - `Pricing is temporarily unavailable, please try again` (order-service:304)
   - `Payment could not be completed, please try again` (order-service:401)
   - `At most N items per order` (order-service:275) — numbers, clear
   - `A valid email address is required` (order-service:260)
   - Client-side: `Verify your email with the 6-digit code before placing the order.`
     (`CheckoutForm.tsx:272`)
   - `Code expires in 10 minutes.` (`CheckoutForm.tsx:382`) — matches the server OTP
     TTL, `expiresAt = +10 min` (`auth-service/index.js:678`). Consistent.
4. **Placement is fine.** Order errors render in the red banner *above the Pay
   button* (`CheckoutForm.tsx:450-452`), OTP-step errors in the separate `emailError`
   slot next to the code input (lines 394-401). Both use `role="alert"`.

### Recommendations

1. Generic fallback: replace the status-code string with
   `"We couldn't place your order — please try again."` (keep `data?.error` for
   recognized messages).
2. Network: `"We couldn't reach the store — please check your connection and try
   again."` — actionable, and it's honest: a network error is not a success and we
   shouldn't imply otherwise.
3. Sold-out mapping per §3 — turns an internal error into a panel.
4. Slug-charset pre-send validation per §2 catches the last class of 400s early.

---

## 5. Session expiry impact — DEPLOYMENT-SECURITY open item #1

### Facts (server, for grounding)

- Access JWT: `expiresIn: '15m'` (`auth-service/index.js:373`); `krt_access` cookie
  `maxAge: 15 * 60 * 1000` (line 456). Refresh token: 7d JWT + `krt_refresh` cookie 7d
  (lines 380-384, 457).
- `POST /api/auth/refresh` exists (`auth-service/index.js:1082`): reads the refresh
  cookie, atomically revokes the old `jti` (lines 1097-1103), mints new access+refresh
  cookies (1107-1109).
- Frontend: **no call to `POST /api/auth/refresh` anywhere** (grep over `src/` — only
  cart cross-tab sync and admin-panel refresh buttons match "refresh").

### Findings

1. **Guest checkout is not session-gated.** POST /api/orders authenticates via the OTP
   proof, not the cookie: "checkout requires a verified email OTP. Verified
   server-side here" (`order-service/index.js:92-93`), and the code is consumed in
   `verifyCheckoutOtp` (line 392) *before* capture (line 398). The only session check
   on the orders API is `GET /` (`order-service/index.js:442-447` → 401
   `Authentication required`). So a user who is mid-checkout — or returns to checkout
   after the session expired — completes the flow; success doesn't need the session.
   **Checkout UX impact of the 15m expiry: ≈ none, by design.**
2. **The expiry is silent, and its UX impact today is elsewhere.** Today no storefront
   page auto-fetches a session-gated API (grep of `src/pages` and `src/components`:
   the only `/api/` calls are `/api/auth/*` and `/api/orders`; `GET /api/orders` has no
   storefront caller — it's for the account dashboard/other surfaces). So the visible
   symptom is "logged out without being told" when hitting a session-gated endpoint,
   e.g. `Authentication required` on the orders list. The open item's phrasing
   ("the storefront never calls refresh, so the user has to log in again") matches
   this assessment.
3. **Interaction worth checking: 15m expiry vs the 10-minute OTP.** OTP TTL is 10 min
   server-side; the checkout UI says "Code expires in 10 minutes." — consistent. The
   session can die while an OTP is live, but the OTP path doesn't need the session.

### Recommendations

1. **Refresh-on-401 helper** (the DEPLOYMENT-SECURITY suggestion): a shared fetch
   wrapper that calls `POST /api/auth/refresh` once on 401 and retries; if refresh
   fails, surface the login screen. This makes any session-gated call self-healing —
   the expiry stops being "silent".
2. **For checkout specifically: no action needed** — the flow is OTP-based. The
   `checkoutAttemptId` work (§1) is orthogonal and improves the double-pay guarantee
   on slow responses, not the session.
3. If a surface ever adds a session-gated read (e.g. the account orders list), it
   should route through the refresh helper so the user sees a logged-in state, not a
   401 banner.

---

## 6. Summary — plan items vs. current state

| # | Plan item | Current state | Verdict |
|---|-----------|---------------|---------|
| 1 | `checkoutAttemptId`: generate per submit; reuse on network-error retry; clear on success/terminal failure | No client state; only `disabled={loading}` guard; server POST / returns a new order per POST | **Client: implement per spec** (§1). **Server: half missing** — add id lookup/store to `POST /api/orders` or the guard is inert |
| 2 | Client-side validation of cart items before sending (slug charset, quantity 1..99) | Quantity clamped twice already; slug accepts any non-empty string | Add submit-time check (§2) |
| 3 | Sold-out UX: "That item is sold out." + Continue-shopping path | Server returns `Unknown product: <slug>`; client shows it raw | Map server message → sold-out panel with Continue shopping → /store/ (§3) |
| 4 | Error message quality | Status-code fallbacks ("Order failed (status N)"), opaque "Failed to fetch", decent server strings | Generic fallbacks + sold-out mapping (§4) |
| — | 15m session expiry impact | OTP-gated checkout unaffected; silent expiry; no storefront page hits a session-gated API today | Checkout ≈ zero impact; refresh-on-401 helper fixes the latent 401s (§5) |

## 7. Strengths observed (keep these)

- OTP flow: server-verified proof-of-control, consumed before capture
  (`order-service/index.js:386-395`); 10-min TTL matches the UI copy.
- Client posts only what it owns: slug+quantity; prices come from the catalog on both
  sides (`CheckoutForm.tsx:290-293` comment; `order-service:109-114`).
- `Unknown product` is a reasonable server message; only its client presentation is
  weak.
- Cart state is validated at write time (`cart.ts:64-77`) — the pre-send check in §2
  adds defense-in-depth at the last moment, not redundant work.
