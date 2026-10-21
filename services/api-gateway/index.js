const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// CORS must be applied to ALL responses including proxy errors.
// Without this, if the backend is down the browser gets a 502 with no
// CORS headers and throws "Failed to fetch" instead of showing the real error.
// ponytail: ALLOWED_ORIGINS is a comma-separated allowlist. '*' is rejected
// at boot — wildcard CORS + Authorization header is the classic CSRF vector.
// Dev default permits the Astro dev server (:4321) and the gateway's own host.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:4321,http://127.0.0.1:4321')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (ALLOWED_ORIGINS.includes('*')) {
  console.error('[Gateway] ALLOWED_ORIGINS="*" is not permitted. Pin it to the real app origin(s).');
  process.exit(1);
}
const corsOptions = {
  origin: (origin, cb) => {
    // ponytail: no-origin (same-origin/server-to-server/curl) → allow.
    // false (not Error) so cors omits the header instead of 500-ing.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  credentials: true
};
app.use(cors(corsOptions));

// ponytail: the client address — NEVER a client-supplied header. This is the
// SAME value the gateway forwards upstream as x-forwarded-for (see the
// proxyReq handler below), so the limiter's bucket and the upstream's audit
// log agree. Keying on a client-supplied X-Forwarded-For would let an
// attacker mint a fresh bucket per request and defeat every limiter.
//
// ponytail: req.ip is the socket peer address UNLESS trust proxy is on, in
// which case express walks the X-Forwarded-For chain from the right and
// stops at the first hop that is not in the trusted list -- so a client
// cannot forge its own address, it can only prepend to it.
//
// TRUST_PROXY matters in production. Behind nginx/Cloudflare/a platform
// router the socket peer is the PROXY, so every customer would collapse into
// ONE bucket: 5 orders/min for the whole store and 60 catalogue reads/min
// for everybody. Set TRUST_PROXY to the proxy's address (loopback for a local
// nginx, or its CIDR) and the limiter sees the real client again. It is
// opt-in and takes an explicit list -- `true` would trust every hop and put
// the header trust back that this file exists to avoid.
//
// If you set TRUST_PROXY, the gateway's port must NOT be published to the
// internet: anything that can reach a trusted hop directly can write the
// X-Forwarded-For that the hop is trusted to have written. Let the proxy be
// the only way in.
const TRUST_PROXY = (process.env.TRUST_PROXY || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (TRUST_PROXY.length) {
  app.set('trust proxy', TRUST_PROXY);
  console.log('[gateway] trusting these proxy hops for the client address:', TRUST_PROXY.join(', '));
}

// ponytail: normalise the client address. An IPv4 client on a dual-stack
// socket arrives as ::ffff:127.0.0.1, and the SAME client over the IPv6
// loopback arrives as ::1 -- so without this one client gets TWO buckets and
// therefore twice the limit. Proven: a client alternating between localhost's
// two addresses got 90 requests through a 60/min limit with no 429 at all.
function normalizeIp(ip) {
  if (!ip) return '';
  const mapped = /^::ffff:(.*)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function peerIp(req) {
  return normalizeIp(req.ip || (req.socket && req.socket.remoteAddress) || '');
}

// ponytail: in-process fixed-window limiter — no dep. The gateway is a single
// process, so an in-memory Map is enough (same shape as the auth service's
// rateLimit()). Ceiling: buckets are per-process and lost on restart, so N
// gateway replicas give N× the limit and a restart clears them. Upgrade path:
// a Redis-backed counter.
//
// Tiers, first match wins. write = non-GET, read = GET, per window per IP.
const RATE_WINDOW_MS = 60_000;
const RATE_TIERS = [
  // POST /api/orders creates an order AND fires a receipt email
  // (order-service → notification-service). The most expensive call in the
  // system: 5/min still lets a shopper retry a failed checkout.
  { paths: ['/api/orders'], write: 5, read: 30 },
  // Everything that SENDS MAIL: 10/min per IP across all recipients. The auth
  // service caps these per (IP,address) and per recipient, but a caller with
  // many addresses gets a fresh bucket for each, so the per-IP total was
  // unbounded until this.
  { paths: ['/api/auth/send-otp', '/api/auth/send-magic-link', '/api/notify'], write: 10, read: 10 },
  // Payment-intent creation: 10/min. The payment service is not proxied any
  // more (see the services map below), so this tier only ever matches a
  // request the gateway answers itself -- it is kept so that re-exposing the
  // route cannot forget the cap.
  { paths: ['/api/payments'], write: 10, read: 60 },
  // The rest of /api/auth (login, register, verify): 30/min. The auth service
  // caps those per (IP,address), so a NEW address evades that — this is the
  // per-IP net that stops credential stuffing across many accounts.
  { paths: ['/api/auth'], write: 30, read: 30 },
  // Reads (catalogue, cart): 60/min — the loosest tier, still finite.
  { paths: ['/api/catalog', '/api/cart'], write: 60, read: 60 }
];
// Anything else: 30/min.
const RATE_FALLBACK = 30;

const hits = new Map();
// ponytail: sweep every 5×window so the map cannot grow without bound.
setInterval(() => hits.clear(), RATE_WINDOW_MS * 5).unref();

function rateTier(req) {
  // ponytail: Express's app.use() routing is CASE-INSENSITIVE by default, so
  // /API/ORDERS reaches the order service exactly like /api/orders does. The
  // tier match has to be case-insensitive too, or one capitalised letter
  // walks straight past the strict cap -- proven: 8/8 POSTs to /API/ORDERS
  // reached the service while the cap was 5/min.
  const path = req.path.toLowerCase();
  for (let i = 0; i < RATE_TIERS.length; i++) {
    const tier = RATE_TIERS[i];
    if (tier.paths.some((p) => path.startsWith(p.toLowerCase()))) {
      return { id: i, max: req.method === 'GET' ? tier.read : tier.write };
    }
  }
  return { id: 'x', max: RATE_FALLBACK };
}

// ponytail: mounted BEFORE the proxies so a limited request never reaches the
// upstream — that is the whole point: the order must not be created and the
// receipt must not be sent.
app.use((req, res, next) => {
  // The health check is polled by monitoring; it must never be limited.
  if (req.path === '/health') return next();
  const tier = rateTier(req);
  // ponytail: the limit is part of the key, so the read and the write budget
  // of a tier are independent buckets. Sharing one counter let a flood of
  // GET /api/orders eat the POST /api/orders budget (and the reverse).
  const key = `${peerIp(req) || 'unknown'}|${tier.id}|${tier.max}`;
  const now = Date.now();
  const entry = hits.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_WINDOW_MS; }
  entry.count++;
  hits.set(key, entry);
  res.setHeader('X-RateLimit-Limit', tier.max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, tier.max - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));
  if (entry.count > tier.max) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
    // ponytail: the same CORS pattern as the proxy error handler below.
    // Without these the browser reports an opaque CORS failure instead of the
    // 429. Access-Control-Expose-Headers is what lets the page READ
    // Retry-After — a hidden header is useless to the client.
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
    }
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  next();
});

// ponytail: no express.json() here — the gateway is a pure proxy. Parsing the
// body consumes the stream before createProxyMiddleware forwards it, so
// backends (e.g. order-service) get an empty body and receipts never send.
// Service targets.
//
// ponytail: the payment and notification services are NOT proxied. They are
// internal-only and their callers are internal:
//   - the notification service is a MAILER: every accepted request sends REAL
//     Gmail from the store's mailbox. Routing it to the browser turned the
//     store into an open email relay for anyone who learned the
//     x-notify-token -- and that token was committed to the repo
//     (services/test/CONTRACT.md, mock-notify.cjs).
//   - the payment service creates and captures intents. Its ids were
//     sequential, so a browser could capture another customer's intent.
// The order service calls both directly, server to server. Re-expose a route
// here ONLY when a browser genuinely needs it -- and give it a real
// authentication story first.
const services = {
  auth: { target: process.env.AUTH_SERVICE_URL || 'http://localhost:3002', path: '/api/auth' },
  catalog: { target: process.env.CATALOG_SERVICE_URL || 'http://localhost:3003', path: '/api/catalog' },
  cart: { target: process.env.CART_SERVICE_URL || 'http://localhost:3004', path: '/api/cart' },
  orders: { target: process.env.ORDER_SERVICE_URL || 'http://localhost:3005', path: '/api/orders' }
};

// Proxy each service
Object.entries(services).forEach(([name, config]) => {
  app.use(
    config.path,
    createProxyMiddleware({
      target: config.target,
      changeOrigin: true,
      // ponytail: fail fast on a hung upstream instead of hanging the browser
      // until a 504. Auth itself bounds its mailer call to 8s, so this is a backstop.
      proxyTimeout: 12000,
      timeout: 12000,
      pathRewrite: {
        [`^${config.path}`]: ''
      },
      // ponytail: http-proxy-middleware v3 nests the event handlers under
      // `on`. The LEGACY top-level names (onProxyReq / onProxyRes / onError)
      // are silently IGNORED by createProxyMiddleware — only
      // legacyCreateProxyMiddleware maps them. The previous code used the
      // legacy names, so none of these handlers ever ran.
      on: {
        error: (err, req, res) => {
          console.error(`[Gateway] ❌ Proxy error for ${name}:`, err.message);
          // Always set CORS headers on error so the browser can read the response
          const origin = req.headers.origin;
          if (origin && ALLOWED_ORIGINS.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
          }
          res.status(502).json({ error: `Service ${name} unavailable` });
        },
        proxyReq: (proxyReq, req) => {
          console.log(`[Gateway] → ${req.method} ${req.path} → ${name} (${config.target})`);
          // ponytail: the gateway is the ONLY hop that may set the forwarded
          // client IP. A client-supplied X-Forwarded-For would otherwise reach
          // the auth service verbatim, and since the auth service trusts one
          // proxy hop, an attacker could mint a fresh rate-limit bucket per
          // request and defeat every limiter (and forge audit-log IPs).
          // Strip whatever the client sent and set it from the socket peer.
          proxyReq.removeHeader('x-forwarded-for');
          proxyReq.removeHeader('x-real-ip');
          proxyReq.removeHeader('forwarded');
          // ponytail: a client-asserted identity must not reach a service
          // that might trust it. The order service no longer reads
          // x-user-id (the owner is the server-verified address), but the
          // header costs nothing to strip here and closes the door for any
          // service that is added later.
          proxyReq.removeHeader('x-user-id');
          const peer = peerIp(req);
          if (peer) proxyReq.setHeader('x-forwarded-for', peer);
          proxyReq.setHeader('x-real-ip', peer || '');
        },
        proxyRes: (proxyRes, req, res) => {
          console.log(`[Gateway] ← ${req.method} ${req.path} ← ${name} status:${proxyRes.statusCode}`);
          // ponytail: the gateway is the ONLY hop the browser talks to, so it
          // owns the CORS policy. The upstream services run a bare
          // `cors()` (no origin list), which answers
          // Access-Control-Allow-Origin: * -- and http-proxy copies the
          // upstream's headers onto the response, OVERWRITING the correct
          // header the gateway's own cors() middleware had just set.
          //
          // The browser then refuses the request: "the value of the
          // Access-Control-Allow-Origin header must not be the wildcard '*'
          // when the request's credentials mode is 'include'". Every
          // credentialed call through the gateway failed -- the order
          // placement (POST /api/orders) most visibly, but the cart and
          // catalog too.
          //
          // So: drop the upstream's CORS headers and re-apply the
          // gateway's own. Same allowlist, same credentials flag, and Vary
          // so a shared cache cannot serve one origin's header to another.
          // proxyRes.headers is a plain object, not a Map.
          delete proxyRes.headers['access-control-allow-origin'];
          delete proxyRes.headers['access-control-allow-credentials'];
          delete proxyRes.headers['access-control-allow-headers'];
          delete proxyRes.headers['access-control-allow-methods'];
          delete proxyRes.headers['access-control-max-age'];
          const origin = req.headers.origin;
          if (origin && ALLOWED_ORIGINS.includes(origin)) {
            proxyRes.headers['access-control-allow-origin'] = origin;
            proxyRes.headers['access-control-allow-credentials'] = 'true';
            proxyRes.headers['access-control-allow-headers'] =
              'Content-Type, Authorization, x-notify-token';
            proxyRes.headers['access-control-allow-methods'] =
              corsOptions.methods.join(',');
            proxyRes.headers['access-control-max-age'] = '600';
          }
          const vary = proxyRes.headers['vary'];
          proxyRes.headers['vary'] =
            !vary || /origin/i.test(vary) ? vary || 'Origin' : `${vary}, Origin`;

          // ponytail: the upstream's own rate-limit headers must NOT win.
          // The auth service sets x-ratelimit-* too, and http-proxy copies
          // the upstream's headers onto the response -- which made the
          // gateway's tier invisible on exactly the routes it was added for
          // (/api/auth/send-otp reported the auth service's 5/min, not the
          // gateway's 10/min). The gateway is the only hop the client sees,
          // so the gateway's numbers are the ones that describe the limit
          // the client actually hit.
          for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']) {
            const value = res.getHeader(h);
            if (value !== undefined) {
              proxyRes.headers[h] = String(value);
            }
          }

          // ponytail: the API origin holds the Secure session cookie, so it
          // needs its own security headers. public/_headers only covers the
          // STATIC site (Netlify), not this service. HSTS here is host-scoped,
          // so the API host needs it as much as the site host does.
          proxyRes.headers['strict-transport-security'] =
            'max-age=31536000; includeSubDomains';
          proxyRes.headers['x-content-type-options'] = 'nosniff';
          proxyRes.headers['referrer-policy'] = 'strict-origin-when-cross-origin';
          // ponytail: no CSP on a JSON API -- there is no document to protect,
          // and a restrictive one only breaks legitimate consumers.
          delete proxyRes.headers['content-security-policy'];
          delete proxyRes.headers['x-frame-options'];
        }
      }
    })
  );
});

// GET /health - Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    gateway: 'active',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
// ponytail: the gateway is the ONE public hop, so it binds every interface.
// The internal services bind loopback by default -- see the auth service.
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`API Gateway running on port ${PORT} (${HOST})`));
