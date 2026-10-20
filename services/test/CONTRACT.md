# Auth security fix — shared contract

All agents MUST conform to this. It is the single source of truth for the change.
If you think the contract is wrong, say so in your report — do not silently diverge.

Repo: `C:\Users\MR.PC\Desktop\wp-bot\design-goods`
Scope: the 5 auth flows (password, email OTP, magic link, registration, admin)
plus the notification service that carries the emails.

---

## Behaviour contract (what "fixed" means)

### C1 — Token transport
Auth responses MUST NOT contain `accessToken` / `refreshToken` in the JSON body.
The `user` object MAY still be returned. Session is carried ONLY by the
`krt_access` / `krt_refresh` httpOnly cookies.

Affected responses: `/login`, `/login-otp`, `/register`, `/verify-magic-link`,
`/admin/login`.

### C2 — `JWT_SECRET` is required
No fallback. If `process.env.JWT_SECRET` is missing or shorter than 32 bytes the
process MUST exit non-zero at boot with a clear message. Delete the literal
`'krt-store-secret-key-dev'`.

### C3 — `trust proxy`
`app.set('trust proxy', 1)` before any middleware, so `req.ip` is the real
client IP behind exactly one proxy hop (the API gateway).

### C4 — Rate limiting
The limiter MUST key on **IP + the subject identifier** (email), not IP alone.
Reason: a single shared IP bucket means one client locks out every other
client, and it also means per-account throttling is impossible.

- `rateLimit({ max, windowMs, key })` where `key` defaults to the IP.
- Auth endpoints pass a key that includes the normalised email.
- Required limits (per IP+email):
  - `send-otp`        max 5 / 60s
  - `send-magic-link` max 5 / 60s
  - `login`           max 10 / 60s
  - `login-otp`       max 10 / 60s
  - `verify-otp`      max 10 / 60s   (NEW — was missing entirely)
  - `register`        max 10 / 60s   (NEW — was missing entirely)
  - `admin/login`     max 5 / 60s
- `verify-otp` and `register` MUST have a limiter. This is the core fix.
- Responses MUST carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` and return 429 when exceeded.
- An email-based limiter MUST NOT be bypassable by changing the email string:
  normalise (trim + lowercase) before using it as a key.

### C5 — OTP attempt counter
The `otps` table gets an `attempts` column (default 0).
- Every failed verification increments `attempts` for that OTP row.
- When `attempts` reaches 5 the row is DELETED (the code is destroyed).
- A successful verification deletes the row (already the case).
- A failed verification MUST NOT delete the row before the threshold — but it
  MUST increment the counter, so brute force is bounded to 5 guesses per issued
  code regardless of rate limiting.
- Issuing a new OTP for the same (email, purpose) MUST invalidate the previous
  one, so only the newest code is live.

### C6 — OTP entropy + storage
- Generate with `crypto.randomInt(100000, 1000000)` — NOT `Math.random()`.
- Hash with a per-row random salt (store `salt` and `hash` columns), not a
  constant salt. A 6-digit space + known salt is reversible from a DB dump.
  Backwards compatible: if a row has no `salt`, verify using the legacy
  constant-salt scheme so existing rows still work.

### C7 — No account enumeration
- `send-otp` returns the SAME status and body for every purpose and for
  existing / non-existing emails: HTTP 200 `{ success: true, message: "If the
  email exists, we sent a code." }`.
- The existing-account check moves OUT of `send-otp`:
  - `register` already checks and returns 409 — that is correct and stays
    (it is the response to a *registration attempt*, not a probe).
  - `login-otp` must NOT return "No account found for this email". It returns a
    generic 400 for both unknown-account and wrong-code.
  - `login` already returns a generic "Invalid credentials" — stays.
- `devOtp` MUST NOT be in any HTTP response. In non-production, log the OTP to
  the console instead. This also removes the "OTP disclosure if NODE_ENV is
  not exactly 'production'" hole.

### C8 — `purpose` allowlist
`send-otp` accepts ONLY `registration | login | checkout`. Anything else →
HTTP 400 and NO email is sent. This closes the HTML-injection-into-branded-email
and open-mail-relay path.

### C9 — Magic link fixed end to end
- The notification service MUST expose `POST /notify/magic-link` (it does not
  today — the whole flow 500s).
- The magic link URL is
  `${FRONTEND_URL}/magic-link?token=<64 hex>&email=<url-encoded>`.
  The frontend route `/magic-link` already exists.
- Expiry comparison MUST be correct. The column is an ISO string and
  `datetime('now')` is space-separated, so a raw `>` compares lexicographically
  and `'T' > ' '` makes every same-day row look valid. Use
  `datetime(expires_at) > datetime('now')`, or store epoch ms as an INTEGER
  and compare numerically. (The OTP queries already wrap in `datetime()` —
  the magic link one does not. Make them consistent.)
- Magic link tokens are single-use: the "mark used" write MUST be atomic
  (`UPDATE ... SET used = 1 WHERE id = ? AND used = 0`) and the caller MUST
  check that a row was actually changed. Same for the refresh-token revoke.
- On email-send failure, delete ONLY the row that failed — not every row for
  that email.

### C10 — Notification service hardening
- Fail CLOSED: if `NOTIFY_TOKEN` is empty the service MUST refuse to start
  (raise at import/startup), not silently accept every caller. Today
  `if NOTIFY_TOKEN and ...` means an empty token disables the check entirely.
- Every user-controlled value interpolated into HTML MUST be escaped
  (`html.escape`). Today `purpose`, `store_name`, `item.name`, `order_id` and
  `otp` are interpolated raw.
- Reject `\r` / `\n` in `subject` and any header value (header injection).
- The notification service renders the templates itself; the auth service must
  STOP sending a pre-rendered `html` field (that field is currently ignored by
  the notification service anyway — the two renderers are a merge artifact).
  The auth service sends structured fields only.
- Blocking Gmail I/O must not run on the asyncio event loop. Use plain `def`
  handlers (FastAPI runs them in a threadpool) or `asyncio.to_thread`.

### C11 — Frontend magic link
- `/magic-link` MUST read `token` and `email` from the query string on mount,
  seed the form, and auto-submit the verification.
- Today `magicToken` is initialised to `""` and never assigned anything else,
  so `canSubmit` is permanently false, the submit button is permanently
  disabled, and the form permanently shows "Invalid magic link."
- The sign-in method (password / otp / magic-link) MUST be ONE piece of state.
  Today `loginOtp` and `loginMagicLink` are independent booleans, so both can
  be true at once and the UI dead-ends.
- The password policy MUST be enforced in BOTH signup steps. Today once
  `otpSent` is true, `canSubmit` collapses to `otp.length === 6` and the
  password/first-name rules stop applying.

### C12 — No `rating` mass assignment
The `rating` field is currently taken from the registration body and stored
unvalidated. The server MUST NOT store a client-supplied rating. Drop it from
the accepted fields.

### C13 — Email normalisation
Normalise email (trim + lowercase) at every ingress point and use the
normalised form for the DB lookup, the rate-limit key, and the OTP/magic-link
rows. `Alice@x.com` and `alice@x.com` are currently two different accounts.

### C14 — Error handling
- No stack traces or internal messages in responses. The error handler must
  return a generic message.
- Async route handlers must not swallow rejections (Express 4 does not catch
  them). Either wrap with `.catch(next)` or convert to sync handlers with
  try/catch. An unhandled rejection currently kills the process.
- `decoded.jti` must be validated before it reaches a DB query.

### C15 — `/me` identity
`/me` currently looks the user up by `decoded.email`. Look up by
`decoded.userId` — the signed subject — so an email change does not silently
invalidate a live session, and so the lookup is not influenced by a
caller-controlled field.

---

## Explicitly OUT of scope

Do NOT change: the storefront UI beyond the auth form, the cart, the catalog,
payments, the sitemap, or the CSP work already merged. Do not add new
dependencies. Do not reformat unrelated code. Keep the diff surgical.

Do NOT rotate real credentials or delete committed files — list them in your
report as required operator actions instead.

## Environment for local testing

- auth-service: `node services/auth-service/index.js`, port 3002
  - env: `JWT_SECRET` (>=32 chars), `NOTIFICATION_SERVICE_URL=http://localhost:8000`,
    `NOTIFY_TOKEN=brunogoyal`, `ALLOWED_ORIGINS=http://localhost:4321`
- mock notification: `node services/test/mock-notify.cjs 8000`
- test suite: `node services/test/auth-security.test.cjs`

`mock-notify.cjs` records every request to `services/test/mock-notify-log.json`
and exposes `GET /__sent` and `GET /__reset` so tests can assert on exactly
what the auth service tried to send.
