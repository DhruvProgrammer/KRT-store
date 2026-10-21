# Deployment & security notes

What has to be true, and what has to be done, before this store takes real
money. Everything here is either an operator action (a secret only you can
rotate) or a deployment decision (a topology only you can choose).

---

## 1. Rotate these before launch — they are in the git history

The repository was public. A secret that was ever committed is a secret you
must rotate; deleting the file now does not un-publish it.

| Secret | Where it was | Action |
|---|---|---|
| `NOTIFY_TOKEN` | `services/test/CONTRACT.md`, `services/test/mock-notify.cjs`, `services/test/auth-security.test.cjs` | **Rotate.** It is the mailer's shared secret: anyone holding it could send email as the store to anyone. The committed copies are gone from the current tree, but they are still in the history. |
| Google OAuth `client_secret` | `services/notification-service/client_secret.json` (was tracked) | **Rotate** in the Google Cloud console and re-download. The file is untracked now and gitignored, but the old one is in the history. |
| Gmail refresh token | `.env.example` in the history | **Revoke and re-issue.** A refresh token is a permanent mailbox credential — it does not expire. |
| `JWT_SECRET` | never committed, but if it was reused anywhere | **Rotate.** It signs every session. |
| `auth.db` (users, password hashes, live refresh tokens) | committed until `6f1b38a` | **Assume every password hash is public.** Ask the affected users to change their password; a hash of a weak password is crackable offline. |

Rewriting the history (`git filter-repo`) is worth doing, but it is **not a
substitute for rotating**: anything that was published has been copied.

After rotating, make sure the new values are only in the untracked `.env`
files. Nothing secret belongs in a committed file — not even a test value
that happens to equal a production value.

---

## 2. The API must be on the same registrable domain as the site

The session is an httpOnly cookie with `SameSite=Strict`. `SameSite` is about
the **site** (scheme + registrable domain) — the **port is irrelevant**.

| Deployment | `localhost:4321` → `localhost:3001` | `krt.design` → `api.krt.design` | `krt.design` → `api.krtstore.com` |
|---|---|---|---|
| Same site? | yes | yes | **no** |
| Cookie sent? | yes | yes | **no** |

If the API is on a different registrable domain, `SameSite=Strict` means the
browser never sends the cookie: the session silently stops working and
`GET /api/orders` is permanently 401. Nothing errors — it just never works.

**Choose one:**

- **Same registrable domain (recommended).** Serve the API from
  `https://api.krt.design` (or `https://krt.design/api/...` behind one
  proxy). `SameSite=Strict` keeps working and cross-site CSRF is
  structurally impossible. No CSRF token needed.
- **A different domain.** Then the cookie has to become
  `sameSite: 'none'; secure: true`, which **requires** real CSRF
  protection (an `Origin` check on every state-changing request, or a
  double-submit token). `SameSite=Strict` is currently doing that job
  implicitly. Do not change the cookie flags without adding the CSRF
  protection in the same change.

Note: `ISSUES.md` sketches the API on `api.krtstore.com`, which is the
second case. If that plan is kept, the cookie flags and the CSRF protection
have to change together.

---

## 3. The gateway's environment

| Variable | Where | What it must be |
|---|---|---|
| `ALLOWED_ORIGINS` | gateway | the **exact** storefront origin, e.g. `https://krt.design`. A comma-separated list is allowed. This is the CORS allowlist — the storefront's `Origin` must be in it or every credentialed call fails in the browser. |
| `TRUST_PROXY` | gateway | **Set this if anything sits in front of the gateway** (nginx, Cloudflare, a platform router). Without it the limiter sees the *proxy's* address, and every customer shares one bucket: 5 orders/min and 60 catalogue reads/min for the whole store. Use the proxy's address or CIDR (`loopback` for a local nginx). **If you set it, the gateway's port must not be published to the internet** — anything that can reach a trusted hop can write the `X-Forwarded-For` that hop is trusted to have written. |
| `HOST` | gateway | `0.0.0.0` (the default) — the gateway is the one public hop. |
| `HOST` | the other services | `127.0.0.1` (the default) outside Docker. The internal services trust one proxy hop, which is only safe if the only thing that can reach them is that proxy. In Docker they get `HOST=0.0.0.0` from `docker-compose.yml` and are `expose`d (unreachable from outside the Docker network). |
| `PUBLIC_API_URL` | build | the **https** origin of the gateway, e.g. `https://api.krt.design`. A production build fails closed on an `http://` or `localhost` value. It is baked into the storefront's CSP and the fetch target. |
| `PUBLIC_SITE_URL` | build | `https://krt.design` (defaults to it). |

---

## 4. What the rate limits are, and what they are not

Per client IP, per 60-second window, enforced at the gateway. The client
address is the socket peer, normalised so an IPv4 client on a dual-stack
socket (`::ffff:127.0.0.1`) and the same client over the IPv6 loopback
(`::1`) share one bucket.

| Route | Limit | Why |
|---|---|---|
| `POST /api/orders` | 5/min | every order sends a receipt email |
| `POST /api/auth/send-otp`, `send-magic-link` | 10/min | everything that sends mail |
| the rest of `/api/auth` | 30/min | credential stuffing across many accounts |
| `/api/catalog`, `/api/cart` | 60/min | scraping |
| `/health` | exempt | monitoring |

**A rate limit is not a budget.** 5 orders/min/IP is still 7,200 emails/day
per IP, and the Gmail daily quota is far lower. Two things are deliberately
*not* solved by the gateway and belong in the services:

- a **per-recipient** and **per-day** cap on receipts (the order service
  verifies an OTP, so the blast radius is limited to addresses the caller
  controls — but a daily budget is still missing);
- an **account lockout** on `/login` and `/admin/login`. The limiters are per
  `(IP, address)`, so rotating the address defeats them outright. A failed
  attempt counter keyed on the *account* does not have that hole.

---

## 4b. Two services are internal and are NOT reachable from the browser

- **The notification service** is a mailer: every accepted request sends
  REAL Gmail from the store's mailbox. Routing it through the gateway turned
  the store into an open email relay for anyone who learned the
  `x-notify-token` — and that token had been committed to the repository.
  It is now called server-to-server by the auth service and the order
  service only.
- **The payment service** creates and captures payment intents. Its ids were
  sequential, so a browser could capture another customer's intent. It is
  now called server-to-server by the order service only.

If you re-expose either of them through the gateway, give it a real
authentication story first, and put a rate limit on the route.

---

## 5. Where the security headers apply

- **The site** (the static frontend, deployed to Netlify) gets
  `public/_headers`: a real `Content-Security-Policy` (with
  `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
  `Cross-Origin-Opener-Policy`. The same policy also ships as a `<meta>`
  tag for the dev server, which does not read `_headers`. `npm run build`
  fails if the two ever drift.
- **The API** (the gateway) sends its own `Strict-Transport-Security`,
  `X-Content-Type-Options` and `Referrer-Policy`. HSTS is host-scoped, so
  the API host needs it as much as the site host does.
- The API host also needs its own `ALLOWED_ORIGINS` and, if it is on a
  separate domain, the CSRF protection described in §2.

---

## 6. Known open items

Not fixed in this pass, in rough priority order:

1. **The session dies after 15 minutes.** The access token lasts 15 minutes
   and the refresh token 7 days, but the storefront never calls
   `POST /api/auth/refresh`, so the user has to log in again. A shared
   fetch helper that refreshes once on a 401 would fix it.
2. **No refresh-token reuse detection.** Rotation is correct (the old token
   is revoked atomically), but a *reused* revoked token is just a 401 — the
   token family is not revoked, so a stolen refresh token can be replayed
   until it expires.
3. **No account lockout** (see §4).
4. **A daily email budget** (see §4).
5. **The cart is localStorage-only** in the storefront; the cart *service*
   is not called by the browser at all.
6. `script-src` still needs `'unsafe-inline'` because the site is a fully
   static build — Astro inlines the hydration runtime. Narrowing it needs
   per-response nonces, i.e. a server-rendered site.

---

## 7. Running the checks

```bash
npm run test:security   # the order/payment/cart selftests, the gateway
                        # limiter tests, the auth suite (146), the CSP drift
                        # check and the catalogue/price check
npm run test:csp        # the Content-Security-Policy header vs the <meta> tag
npm run test:catalog    # the catalogue's slugs and prices vs the storefront's
npm run test:auth       # the auth security suite on its own
npm run test:gateway    # the rate-limit tier and the trusted-proxy checks
```

`npm run build` also runs the CSP and catalogue checks, so a deploy that
would break the storefront or sell an unbuyable product fails the build.
