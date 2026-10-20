const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
// ponytail: ArgonVault = audited Argon2id + HMAC pepper + salt + versioning
// (see argonvault.js). NOT a custom algorithm — composed per OWASP / RFC 9106.
const { argonvaultHash, argonvaultVerify, needsRehash } = require('./argonvault');
const { assertPepperAvailable } = require('./argonvault-pepper');

const app = express();
// ponytail: same allowlist pattern as the gateway. The auth-service is behind
// the gateway but browser scripts could fetch it directly in dev, so pin it.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:4321,http://127.0.0.1:4321')
  .split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
// ponytail: trust exactly one proxy hop (the API gateway). Without this,
// req.ip is the gateway's socket address for EVERY request, which collapses
// all per-IP rate limiting into one global bucket and writes the gateway's
// address into every audit-log row.
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// ponytail: password policy. NIST 800-63B says length > complexity, but we
// keep a floor of 8 + a ceiling (prevent abuse) + a tiny blocklist. No
// "must contain uppercase+symbol" theater — that just annoys users without
// meaningfully raising entropy.
const WEAK_PASSWORDS = new Set(['password', '12345678', 'password1', 'qwerty12', 'letmein1', '11111111', '00000000', 'abc12345', 'iloveyou']);
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) return 'Password must be 8–128 characters';
  // ponytail: ArgonVault canonicalises (NFKC + trim) and rejects an empty
  // result, so a whitespace-only password would throw inside the hasher.
  // Reject it here instead of letting it become an unhandled rejection.
  if (!pw.trim()) return 'Password cannot be only whitespace';
  if (WEAK_PASSWORDS.has(pw.toLowerCase())) return 'Password is too common';
  return null;
}

// ponytail: Express 4 does NOT catch rejected promises from async handlers —
// an unhandled rejection terminates the process. Every async route goes
// through this wrapper so a throw becomes a 500 instead of a dead service.
const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ponytail: in-memory rate limiter — no dep. Ceiling: resets on restart, not
// shared across instances. Upgrade path: swap for a Redis-backed limiter when
// the service scales past one process. key=identifier, max=N, windowMs=W.
//
// The key is IP + the subject identifier (the normalised email). Keying on
// the IP alone was wrong in both directions: one shared bucket let a single
// client lock every other customer out of login, and it made per-account
// throttling impossible.
function rateLimit({ max, windowMs, key }) {
  const hits = new Map();
  // ponytail: sweep every 5×window to avoid unbounded growth. Naive but fine
  // for a single-process dev/stage service.
  setInterval(() => hits.clear(), windowMs * 5).unref();
  return (req, res, next) => {
    const id = key ? key(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    const entry = hits.get(id) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    hits.set(id, entry);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}

// ponytail: JWT_SECRET is REQUIRED. The old fallback was a literal committed
// to the repo, so a deploy that forgot the variable silently signed tokens
// with a public secret — and /me echoes the subject's id and role, which is
// exactly what a forged admin token needs.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    '[auth] FATAL: JWT_SECRET is required and must be at least 32 characters. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
  );
  process.exit(1);
}
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8000';
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4321';
const STORE_NAME = process.env.STORE_NAME || 'KRT Store';
// ponytail: admin creds are env-only, never bundled. ADMIN_PASSWORD_HASH is a
// pre-hashed value (see scripts/hash-admin-password.js) — the server never
// sees the plaintext. ADMIN_BOOTSTRAP=true creates the admin row on first
// boot if no admin exists; flip it to false (or unset it) after the row exists.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_BOOTSTRAP = process.env.ADMIN_BOOTSTRAP === 'true';

// ponytail: one fixed message for every send-otp response. The previous
// version answered 404/409 depending on whether the address existed, which
// is a free account-enumeration oracle. The existence check now lives in
// /register, where it belongs (a registration attempt, not a probe).
const GENERIC_SEND_MESSAGE = 'If the email exists, we sent a code.';
const GENERIC_SEND_BODY = { success: true, message: GENERIC_SEND_MESSAGE };
const INVALID_CODE = { error: 'Invalid or expired code' };
const INVALID_CREDENTIALS = { error: 'Invalid credentials' };
// ponytail: the only purposes this service will issue a code for. An
// unvalidated purpose was interpolated straight into the branded email
// template — an HTML-injection / open-relay primitive.
const OTP_PURPOSES = new Set(['registration', 'login', 'checkout']);
// ponytail: a code is destroyed after this many wrong guesses, independent of
// the rate limiter. The limiter bounds request RATE; this bounds the number
// of guesses per issued code, which is the property that actually matters.
const MAX_OTP_ATTEMPTS = 5;

// ponytail: the pepper is REQUIRED. Without it every registration throws
// (a 500), every password check silently fails (a 401 that looks like a wrong
// password), and the timing-equalisation hash cannot be built — so account
// existence leaks through response time. Refuse to start instead.
assertPepperAvailable();

// Initialize SQLite database
// ponytail: the path is configurable so the container can keep the database on
// a mounted volume (it holds password hashes and refresh tokens — a runtime
// artifact, not a source file).
const db = new Database(process.env.AUTH_DB_PATH || 'auth.db');
// ponytail: wait instead of throwing when another process holds the write
// lock. Without this the service CRASHES AT BOOT with "database is locked".
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT,
    email_verified INTEGER DEFAULT 0,
    phone TEXT,
    rating INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ponytail: additive migrations. Each ALTER is wrapped because ALTER TABLE ADD
// COLUMN fails the second time the schema runs — without the IF EXISTS guard
// the boot would crash on every restart after the first migration.
function safeAddColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
safeAddColumn('users', 'role', "TEXT NOT NULL DEFAULT 'CUSTOMER'");
safeAddColumn('users', 'last_login_at', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ponytail: two columns the OTP flow needs and did not have.
//   attempts — wrong-guess counter; the row is destroyed at MAX_OTP_ATTEMPTS.
//   salt     — per-row random salt. A 6-digit space hashed with a constant
//              salt is fully reversible from any database snapshot.
safeAddColumn('otps', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
safeAddColumn('otps', 'salt', 'TEXT');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at);

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
`);

// ponytail: admin_id was NOT NULL, so a FAILED admin login — the exact event
// an audit log exists for — threw on insert and was silently swallowed. The
// column is rebuilt as nullable (rows preserved) so a failed attempt can be
// recorded with a null admin_id.
(function relaxAdminIdNullability() {
  const cols = db.prepare('PRAGMA table_info(admin_audit_log)').all();
  const adminId = cols.find((c) => c.name === 'admin_id');
  if (!adminId || !adminId.notnull) return;
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE admin_audit_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id TEXT,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT INTO admin_audit_log_new
        (id, admin_id, admin_email, action, target, detail, ip, user_agent, created_at)
      SELECT id, admin_id, admin_email, action, target, detail, ip, user_agent, created_at
      FROM admin_audit_log
    `);
    db.exec('DROP TABLE admin_audit_log');
    db.exec('ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at)');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[auth] could not relax admin_audit_log.admin_id:', err.message);
  }
})();

// ponytail: email normalisation at the edge. "Alice@x.com" and "alice@x.com"
// were two different accounts, and a stray space forked the account and broke
// every later lookup, magic link and rate-limit key.
function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// ponytail: users.email is UNIQUE with the default BINARY collation, so a
// legacy mixed-case row and a new lowercase row for the same person could
// both exist — and the lookup would silently pick the wrong one. This index
// makes the address unique case-insensitively. It can only be created when
// no such pair already exists, so a pre-existing duplicate is a real
// problem: it must not be ignored, because a lookup would then resolve to
// an ARBITRARY one of the two rows.
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email))');
} catch (err) {
  const message =
    '[auth] FATAL: could not create the case-insensitive email index — ' +
    'two accounts differ only in case. Logins for that address would resolve ' +
    'to an arbitrary account. Merge or delete the duplicate rows and restart. (' +
    (err && err.message) +
    ')';
  if (process.env.NODE_ENV === 'production') {
    console.error(message);
    process.exit(1);
  }
  console.error(message);
}

// ponytail: the rate-limit key uses the normalised address, so case and
// whitespace variants share one bucket while a genuinely different address
// does not. The key is HASHED because it is built from attacker-controlled
// input: an uncapped email could be ~100 KB per bucket, and the bucket map
// holds every key for 5× the window.
function subjectKey(req) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const email = req.body && typeof req.body.email === 'string'
    ? req.body.email.trim().toLowerCase().slice(0, 254)
    : '';
  return crypto.createHash('sha1').update(`${ip}|${email}`).digest('base64');
}

// ponytail: a per-RECIPIENT limiter, keyed on the address alone. The
// per-caller limiter can be evaded by rotating the forwarded IP, so
// /send-otp is additionally capped per recipient — otherwise one caller can
// invalidate a victim's live code over and over (a login DoS) and bomb the
// victim's inbox.
function recipientKey(req) {
  const email = req.body && typeof req.body.email === 'string'
    ? req.body.email.trim().toLowerCase().slice(0, 254)
    : '';
  return crypto.createHash('sha1').update(`rcpt|${email}`).digest('base64');
}

// ponytail: OTP hashing. New codes use a per-row random salt; rows written
// before the salt column existed carry salt = NULL and are verified with the
// legacy constant-salt scheme so a deployment does not lock anyone out.
const OTP_SALT_BYTES = 16;
function hashOtp(otp, salt) {
  if (salt) return crypto.createHash('sha256').update(`${salt}:${otp}`).digest('hex');
  return crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
}
function verifyOtpHash(otp, row) {
  const candidate = hashOtp(otp, row.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(row.otp_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ponytail: crypto.randomInt, not Math.random. A 6-digit code is a
// credential; Math.random's state is recoverable from a handful of outputs.
function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(user) {
  // ponytail: jti is recorded server-side so we can revoke individual
  // refresh tokens (logout-everywhere, stolen-device revoke, etc).
  const jti = crypto.randomUUID();
  const token = jwt.sign({ userId: user.id, jti }, JWT_SECRET + '_refresh', { expiresIn: '7d' });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)`)
    .run(jti, user.id, expiresAt);
  return token;
}

// ponytail: ArgonVault is the new password store (Argon2id + pepper). Legacy
// scrypt rows ("salt:hex64", no AV2: prefix) still verify via scrypt so we can
// migrate without a forced password reset; a successful scrypt login rehashes
// the password into ArgonVault transparently (see needsRehash() at call sites).
// Legacy plaintext rows (no ':') verify against the raw string during the
// earliest migration — kept only to avoid lockout on ancient dev DBs.
async function hashPassword(password) {
  return argonvaultHash(password);
}

// async wrapper: verify against ArgonVault (AV2:) OR legacy scrypt/plaintext.
// On success + needsRehash, the caller rehashes and persists — returns true so
// the call site can treat upgrade as a verify-side concern.
async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (typeof stored === 'string' && stored.startsWith('AV2:')) {
    return argonvaultVerify(password, stored);
  }
  // Legacy scrypt "salt:hex64" (or ancient plaintext "no colon").
  if (typeof stored === 'string' && stored.includes(':')) {
    const [salt, hash] = stored.split(':');
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(derived, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return stored === password; // ponytail: ancient plaintext — dev DB only
}

// ponytail: a REAL Argon2id hash of a random value, built once at boot. It is
// used to burn the same CPU time when the account does not exist: without it
// an unknown address answers in ~2 ms while a known one takes ~50 ms of
// Argon2id, which is a 25x timing oracle even though the response bodies
// are byte-identical. A hardcoded literal would have to be a genuine hash to
// be useful, so it is generated instead.
let DUMMY_HASH = null;
async function initDummyHash() {
  try {
    DUMMY_HASH = await argonvaultHash(crypto.randomBytes(32).toString('hex'));
  } catch (err) {
    // A missing pepper is fatal in production; argonvault already fails loud.
    console.error('[auth] could not build the timing-equalisation hash:', err.message);
  }
}

// ponytail: always spend the KDF cost, whether or not the user exists.
async function verifyPasswordOrBurn(password, stored) {
  if (!stored) {
    if (DUMMY_HASH) await verifyPassword(password, DUMMY_HASH);
    return false;
  }
  return verifyPassword(password, stored);
}

// ponytail: tokens are httpOnly cookies — never readable from JS, so any
// XSS payload can't exfiltrate them via document.cookie. SameSite=Strict
// blocks CSRF. Secure is forced in production (NODE_ENV=production). The
// access cookie is short (15m, matches the JWT expiry) and the refresh
// cookie is longer (7d) so silent rotation just works.
const COOKIE_ACCESS = 'krt_access';
const COOKIE_REFRESH = 'krt_refresh';
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/'
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(COOKIE_ACCESS, accessToken, { ...COOKIE_BASE, maxAge: 15 * 60 * 1000 });
  res.cookie(COOKIE_REFRESH, refreshToken, { ...COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function clearAuthCookies(res) {
  res.clearCookie(COOKIE_ACCESS, COOKIE_BASE);
  res.clearCookie(COOKIE_REFRESH, COOKIE_BASE);
}

// ponytail: read token from Bearer header (CLI/script use) OR cookie (browser).
// Without this, switching to cookie-based auth would break every existing caller.
function readAccessToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.substring(7);
  const fromCookie = req.cookies?.[COOKIE_ACCESS];
  return fromCookie || null;
}

function generateMagicToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashMagicToken(token) {
  return crypto.createHash('sha256').update(token + 'krt-magic-salt').digest('hex');
}

// ponytail: admins live in the same users table with role='ADMIN'. The
// password hash is supplied via env (never the plaintext). On first boot,
// ADMIN_BOOTSTRAP=true creates a single admin row if none exists — the
// operator sets ADMIN_BOOTSTRAP=false (or unsets it) after the row lands,
// so a leaked DATABASE_URL can't recreate the admin.
function bootstrapAdmin() {
  if (!ADMIN_BOOTSTRAP) return;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
    console.warn('[auth] ADMIN_BOOTSTRAP=true but ADMIN_EMAIL or ADMIN_PASSWORD_HASH is missing — skipping');
    return;
  }
  // ponytail: NORMALISE before inserting. Every login path lowercases the
  // address, so a row inserted as "Admin@Example.COM" could never be matched
  // — the admin would be locked out of their own account.
  const email = normalizeEmail(ADMIN_EMAIL);
  if (!email) {
    console.warn(`[auth] ADMIN_EMAIL is not a valid address (${ADMIN_EMAIL}) — skipping bootstrap`);
    return;
  }
  const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ? AND role = 'ADMIN'").get(email);
  if (existing) return;
  const id = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO users (id, email, password, first_name, role, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, 'Admin', 'ADMIN', 1, datetime('now'), datetime('now'))
    `).run(id, email, ADMIN_PASSWORD_HASH);
  } catch (err) {
    // ponytail: the INSERT can still hit UNIQUE if a row with this address
    // exists under a different role — the check above only looks for role
    // 'ADMIN'. That must NOT take the whole service down at boot.
    console.error(
      `[auth] could not bootstrap the admin ${email}:`,
      err && err.message
    );
    return;
  }
  console.log(`[auth] Bootstrapped admin user ${email}`);
}

function auditAdmin(admin, action, req, target, detail) {
  try {
    db.prepare(`
      INSERT INTO admin_audit_log (admin_id, admin_email, action, target, detail, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      admin && admin.id ? admin.id : null,
      (admin && admin.email) || ADMIN_EMAIL || 'unknown',
      action,
      target || null,
      detail ? JSON.stringify(detail) : null,
      req?.ip || null,
      req?.headers?.['user-agent'] || null
    );
  } catch (err) {
    console.error('[auth] audit log failed:', err.message);
  }
}

function requireAdmin(req, res) {
  const token = readAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return null;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return null;
    }
    const admin = db.prepare('SELECT id, email, role FROM users WHERE id = ? AND role = ?').get(decoded.userId, 'ADMIN');
    if (!admin) {
      res.status(403).json({ error: 'Admin not found' });
      return null;
    }
    return admin;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

// Helper function to send magic link email via notification service
async function sendMagicLinkEmail(email, link) {
  const subject = 'Your KRT Store sign-in link';
  try {
    console.log('[auth] Sending magic link to notification service:', NOTIFICATION_SERVICE_URL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${NOTIFICATION_SERVICE_URL}/notify/magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-token': NOTIFY_TOKEN
      },
      // ponytail: structured fields only. The notification service renders the
      // template — it owns escaping, so a caller can never inject markup into
      // a store-branded email.
      body: JSON.stringify({
        email,
        subject,
        link,
        purpose: 'signin',
        store_name: STORE_NAME
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    console.log('[auth] Notification service response:', response.status, response.statusText);
    if (!response.ok) {
      const error = await response.text();
      console.error('[auth] Magic link email send failed:', response.status, error);
      throw new Error('Failed to send magic link email');
    }

    console.log(`[auth] Magic link sent to ${email}`);
    return true;
  } catch (error) {
    console.error('[auth] Magic link email error:', error.message, error.stack);
    throw error;
  }
}

// Helper function to send OTP email via notification service
async function sendOTPEmail(email, otp, purpose) {
  const subject = purpose === 'login'
    ? 'Your KRT Store sign-in code'
    : 'Your KRT Store verification code';

  try {
    console.log('[auth] Sending OTP to notification service:', NOTIFICATION_SERVICE_URL);
    // ponytail: bound the email call so a slow/hanging mailer can't hang the
    // whole signup/checkout request until the gateway 504s.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${NOTIFICATION_SERVICE_URL}/notify/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-token': NOTIFY_TOKEN
      },
      // ponytail: structured fields only — no pre-rendered HTML. The
      // notification service owns the template and the escaping.
      body: JSON.stringify({
        email,
        subject,
        otp,
        purpose,
        store_name: STORE_NAME
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    console.log('[auth] Notification service response:', response.status, response.statusText);
    if (!response.ok) {
      const error = await response.text();
      console.error('[auth] OTP email send failed:', response.status, error);
      throw new Error('Failed to send OTP email');
    }

    console.log(`[auth] OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error('[auth] OTP email error:', error.message, error.stack);
    throw error;
  }
}

// ponytail: 5/min per IP+address — email-sending is the expensive+abusable resource.
const sendOtpLimiter = rateLimit({ max: 5, windowMs: 60_000, key: subjectKey });
// ponytail: a SECOND, per-recipient cap on /send-otp. The per-caller limiter
// can be evaded by rotating the forwarded IP, and every new code invalidates
// the recipient's previous one — so without this, one caller could keep
// invalidating a victim's live code (a login DoS) and flood their inbox.
const sendOtpRecipientLimiter = rateLimit({ max: 5, windowMs: 60_000, key: recipientKey });
// POST /send-otp - Send OTP to email
app.post('/send-otp', sendOtpLimiter, sendOtpRecipientLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const purpose = req.body && typeof req.body.purpose === 'string' ? req.body.purpose : 'registration';

  if (!email) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  // ponytail: allowlist. An unvalidated purpose was forwarded to the mailer
  // and interpolated into its template.
  if (!OTP_PURPOSES.has(purpose)) {
    return res.status(400).json({ error: 'Invalid purpose' });
  }

  // Generate OTP
  const otp = generateOTP();
  const salt = crypto.randomBytes(OTP_SALT_BYTES).toString('hex');
  const otpHash = hashOtp(otp, salt);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // ponytail: only the newest code for an (email, purpose) is live. Leaving
  // the old row behind let an earlier code keep working.
  db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(email, purpose);

  const info = db.prepare(`
    INSERT INTO otps (email, otp_hash, purpose, expires_at, salt, attempts)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(email, otpHash, purpose, expiresAt, salt);
  const otpId = info.lastInsertRowid;

  // Send OTP email
  try {
    await sendOTPEmail(email, otp, purpose);
    res.json(GENERIC_SEND_BODY);
  } catch (error) {
    // ponytail: in dev, email delivery is optional — keep the OTP and log it
    // so signup/login still works locally without a configured mailer. It is
    // NEVER returned in the response body: that turned "NODE_ENV is not
    // exactly 'production'" into a full authentication bypass.
    if (process.env.NODE_ENV === 'production') {
      db.prepare('DELETE FROM otps WHERE id = ?').run(otpId);
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }
    console.log(`[auth][dev] OTP for ${email} (${purpose}): ${otp}`);
    res.json(GENERIC_SEND_BODY);
  }
}));

// ponytail: a wrong guess is counted against the code itself, so the number
// of guesses per issued code is bounded even if the request rate is not.
function recordFailedOtpAttempt(row) {
  const attempts = (row.attempts || 0) + 1;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    db.prepare('DELETE FROM otps WHERE id = ?').run(row.id);
    return attempts;
  }
  db.prepare('UPDATE otps SET attempts = ? WHERE id = ?').run(attempts, row.id);
  return attempts;
}

// POST /verify-otp - Verify OTP (the checkout gate)
const verifyOtpLimiter = rateLimit({ max: 10, windowMs: 60_000, key: subjectKey });
app.post('/verify-otp', verifyOtpLimiter, (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const otp = req.body && typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
  const purpose = req.body && typeof req.body.purpose === 'string' ? req.body.purpose : 'registration';

  if (!email || !otp) {
    return res.status(400).json(INVALID_CODE);
  }
  if (!OTP_PURPOSES.has(purpose)) {
    return res.status(400).json({ error: 'Invalid purpose' });
  }

  // ponytail: datetime() wraps the column. expires_at is an ISO string
  // ("2026-10-20T14:00:00.000Z") and datetime('now') is space-separated, so a
  // raw `>` compares lexicographically and 'T' > ' ' makes every same-day row
  // look valid — a 10-minute code living for a day.
  const otpRecord = db.prepare(`
    SELECT * FROM otps
    WHERE email = ? AND purpose = ? AND datetime(expires_at) > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(email, purpose);

  if (!otpRecord) {
    return res.status(400).json(INVALID_CODE);
  }
  if (!verifyOtpHash(otp, otpRecord)) {
    recordFailedOtpAttempt(otpRecord);
    return res.status(400).json(INVALID_CODE);
  }

  // Delete used OTP
  db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);

  res.json({ success: true });
});

// POST /register - Register new user (requires verified email)
const registerLimiter = rateLimit({ max: 10, windowMs: 60_000, key: subjectKey });
app.post('/register', registerLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const password = req.body && req.body.password;
  const firstName = req.body && typeof req.body.first_name === 'string' ? req.body.first_name.trim() : '';
  const lastName = req.body && typeof req.body.last_name === 'string' ? req.body.last_name.trim() : '';
  const phone = req.body && typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const otp = req.body && typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
  // ponytail: `rating` is NOT read. It was a client-supplied value written
  // straight into the user row — a mass-assignment sink with no owner.

  if (!email || typeof password !== 'string' || !firstName || !otp) {
    return res.status(400).json({ error: 'Email, password, first name, and OTP are required' });
  }

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  // Verify OTP. Checked BEFORE the duplicate-account check so a probe with a
  // wrong code cannot tell an existing account from a new one.
  const otpRecord = db.prepare(`
    SELECT * FROM otps
    WHERE email = ? AND purpose = 'registration' AND datetime(expires_at) > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(email);

  if (!otpRecord || !verifyOtpHash(otp, otpRecord)) {
    if (otpRecord) recordFailedOtpAttempt(otpRecord);
    return res.status(400).json(INVALID_CODE);
  }

  // Check if user already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (existingUser) {
    return res.status(409).json({ error: 'User already exists' });
  }

  // Create user
  const userId = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password, first_name, last_name, phone, email_verified, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'CUSTOMER', datetime('now'), datetime('now'))
  `);
  try {
    stmt.run(
      userId,
      email,
      await hashPassword(password),
      firstName,
      lastName || null,
      phone || null
    );
  } catch (err) {
    // ponytail: two concurrent registrations for the same address both pass
    // the existence SELECT, and the second INSERT trips the UNIQUE constraint.
    // That surfaced as an unhandled rejection, which killed the process. It is
    // a normal outcome, not a server fault — answer 409.
    if (String(err && err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'User already exists' });
    }
    throw err;
  }

  // Delete used OTP
  db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);

  // Get the created user
  const user = db.prepare('SELECT id, email, first_name, last_name, phone, role FROM users WHERE id = ?').get(userId);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  setAuthCookies(res, accessToken, refreshToken);
  // ponytail: NO token in the body. The session is the httpOnly cookie; a
  // token in the JSON body is readable by any XSS payload and undoes the
  // whole point of httpOnly.
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role
    }
  });
}));

// POST /login - Login (sets session cookies)
async function handleLogin(req, res) {
  const email = normalizeEmail(req.body && req.body.email);
  const password = req.body && req.body.password;

  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  // ponytail: one branch, one message. The old code answered 404 for an
  // unknown address and 401 for a wrong password — a free enumeration oracle.
  // ponytail: the KDF is ALWAYS run, even when the user does not exist. A
  // short-circuit here (`!user || !await verify(...)`) would skip the hash
  // for an unknown address and leave a ~25x timing oracle.
  const passwordOk = await verifyPasswordOrBurn(password, user && user.password);
  if (!user || !passwordOk) {
    return res.status(401).json(INVALID_CREDENTIALS);
  }

  // ponytail: transparent upgrade. Legacy scrypt rows or out-of-date Argon2id
  // params get rehashed here so users migrate on next login, no forced reset.
  if (needsRehash(user.password)) {
    const rehashed = await hashPassword(password);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?').run(rehashed, user.id);
    user.password = rehashed;
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  setAuthCookies(res, accessToken, refreshToken);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role
    }
  });
}
// ponytail: 10/min per IP+address — blocks credential stuffing while letting
// legit fat-finger retries through.
const loginLimiter = rateLimit({ max: 10, windowMs: 60_000, key: subjectKey });
app.post('/login', loginLimiter, (req, res, next) => {
  handleLogin(req, res).catch(next);
});

// POST /login-otp - Passwordless sign-in via OTP (sets session cookies)
const loginOtpLimiter = rateLimit({ max: 10, windowMs: 60_000, key: subjectKey });
app.post('/login-otp', loginOtpLimiter, (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const otp = req.body && typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

  if (!email || !otp) {
    return res.status(400).json(INVALID_CODE);
  }

  const otpRecord = db.prepare(`
    SELECT * FROM otps
    WHERE email = ? AND purpose = 'login' AND datetime(expires_at) > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(email);

  // ponytail: an unknown account and a wrong code produce the SAME response.
  // The old code answered 404 "No account found for this email" — enumeration.
  if (!otpRecord) {
    return res.status(400).json(INVALID_CODE);
  }
  if (!verifyOtpHash(otp, otpRecord)) {
    recordFailedOtpAttempt(otpRecord);
    return res.status(400).json(INVALID_CODE);
  }

  const user = db.prepare('SELECT id, email, first_name, last_name, phone, role FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    return res.status(400).json(INVALID_CODE);
  }

  db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  setAuthCookies(res, accessToken, refreshToken);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role
    }
  });
});

// POST /send-magic-link - Send magic link for passwordless sign-in
// ponytail: 5/min per IP+address — same email-sending abuse vector as send-otp.
const magicLinkLimiter = rateLimit({ max: 5, windowMs: 60_000, key: subjectKey });
// ponytail: the same per-RECIPIENT cap as /send-otp. Without it, a caller
// rotating its forwarded IP could mail the victim an unbounded number of
// sign-in links and leave an unbounded number of magic_links rows behind.
const magicLinkRecipientLimiter = rateLimit({ max: 5, windowMs: 60_000, key: recipientKey });
app.post('/send-magic-link', magicLinkLimiter, magicLinkRecipientLimiter, asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);

  if (!email) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  // Check if user exists (only registered users can use magic links)
  const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    // Don't reveal if email exists — return generic success for security
    return res.json({ success: true, message: 'If the email exists, a sign-in link has been sent' });
  }

  // Generate and store magic link token
  const token = generateMagicToken();
  const tokenHash = hashMagicToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  const info = db.prepare(`
    INSERT INTO magic_links (email, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(email, tokenHash, expiresAt);
  const linkId = info.lastInsertRowid;

  // ponytail: the link points at the page that actually exists. It used to
  // point at /auth/verify-magic, which is not a route in this app.
  const magicLink = `${FRONTEND_URL}/magic-link?token=${token}&email=${encodeURIComponent(email)}`;

  // Send magic link email
  try {
    await sendMagicLinkEmail(email, magicLink);
    res.json({ success: true, message: 'If the email exists, a sign-in link has been sent' });
  } catch (error) {
    // Clean up on email failure — THIS row only. The old code deleted every
    // link for the address, destroying links the user had not used yet.
    db.prepare('DELETE FROM magic_links WHERE id = ?').run(linkId);
    return res.status(500).json({ error: 'Failed to send magic link email' });
  }
}));

// POST /verify-magic-link - Verify magic link and set session cookies
// ponytail: the token is 64 hex chars so it is not brute-forceable, but an
// unthrottled endpoint is still a free DB-query amplifier.
const verifyMagicLinkLimiter = rateLimit({ max: 10, windowMs: 60_000, key: subjectKey });
app.post('/verify-magic-link', verifyMagicLinkLimiter, (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  const token = req.body && typeof req.body.token === 'string' ? req.body.token.trim() : '';

  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required' });
  }

  const tokenHash = hashMagicToken(token);
  // ponytail: datetime() wraps the column — see the note on /verify-otp. A
  // raw `>` compares an ISO string against a space-separated one, so a
  // 15-minute link stayed valid for the rest of the day.
  const magicLink = db.prepare(`
    SELECT * FROM magic_links
    WHERE email = ? AND token_hash = ? AND datetime(expires_at) > datetime('now') AND used = 0
    ORDER BY id DESC LIMIT 1
  `).get(email, tokenHash);

  if (!magicLink) {
    return res.status(400).json({ error: 'Invalid or expired magic link' });
  }

  // ponytail: claim the token ATOMICALLY. The old code selected, then updated
  // — two concurrent verifications both read used = 0 and both minted a
  // session, so one link could be redeemed twice.
  const claim = db.prepare('UPDATE magic_links SET used = 1 WHERE id = ? AND used = 0').run(magicLink.id);
  if (claim.changes !== 1) {
    return res.status(400).json({ error: 'Invalid or expired magic link' });
  }

  // Get user
  const user = db.prepare('SELECT id, email, first_name, last_name, phone, role FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  setAuthCookies(res, accessToken, refreshToken);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role
    }
  });
});

// GET /me - Validate token (Bearer header OR httpOnly cookie) and return user info
app.get('/me', (req, res) => {
  const token = readAccessToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // ponytail: look the user up by the SIGNED subject (userId), not by
    // decoded.email. Two lookups that disagree are a latent bug, and an
    // email change would silently invalidate a live session.
    const user = db.prepare('SELECT id, email, first_name, last_name, phone, role FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      role: user.role,
      authenticated: true
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// POST /refresh - Rotate access token using the refresh cookie. The old
// refresh token is revoked (single-use) so a stolen cookie can't keep
// refreshing forever. Returns a new access cookie.
app.post('/refresh', (req, res) => {
  const token = req.cookies?.[COOKIE_REFRESH];
  if (!token) return res.status(401).json({ error: 'No refresh token' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET + '_refresh', { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
  if (!decoded || typeof decoded.jti !== 'string' || !decoded.jti) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
  // ponytail: the revocation IS the check. The old code read revoked_at and
  // updated it in two separate statements, so two concurrent refreshes could
  // both pass the check and both mint a session.
  const revoke = db.prepare(`
    UPDATE refresh_tokens SET revoked_at = datetime('now')
    WHERE jti = ? AND revoked_at IS NULL
  `).run(decoded.jti);
  if (revoke.changes !== 1) {
    return res.status(401).json({ error: 'Refresh token revoked' });
  }
  const row = db.prepare('SELECT user_id FROM refresh_tokens WHERE jti = ?').get(decoded.jti);
  const user = row ? db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) : null;
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ success: true });
});

// POST /logout - Revoke the current refresh token + clear cookies.
app.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_REFRESH];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET + '_refresh', { algorithms: ['HS256'] });
      db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE jti = ?").run(decoded.jti);
    } catch { /* expired token — nothing to revoke */ }
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

// NOTE: the error handler lives at the END of this file, after every route.
// Express only searches FORWARD from the failing layer for a 4-arg handler,
// so a handler registered here would never catch an error thrown by the
// /admin/* routes below — those would fall through to Express's default
// HTML page, which leaks a stack trace.

// POST /admin/login - Admin sign-in. Logs every attempt (success + failure)
// to admin_audit_log.
// ponytail: 5/min per IP+address — tighter than user login; admin is the crown jewels.
const adminLoginLimiter = rateLimit({ max: 5, windowMs: 60_000, key: subjectKey });
app.post('/admin/login', adminLoginLimiter, (req, res, next) => {
  handleAdminLogin(req, res).catch(next);
});

async function handleAdminLogin(req, res) {
  const email = normalizeEmail(req.body && req.body.email);
  const password = req.body && req.body.password;
  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const admin = db.prepare("SELECT * FROM users WHERE lower(email) = ? AND role = 'ADMIN'").get(email);
  if (!admin) {
    // ponytail: burn the same CPU time as a real verification, so the
    // response time does not reveal whether the address is an admin.
    await verifyPasswordOrBurn(password, null);
    // The audit row records the ATTEMPTED address, not a null one — and
    // admin_id is nullable so the insert does not throw and lose the event.
    auditAdmin({ email }, 'login.fail.no_user', req, email, { reason: 'no_admin_with_email' });
    return res.status(401).json(INVALID_CREDENTIALS);
  }
  if (!await verifyPasswordOrBurn(password, admin.password)) {
    auditAdmin(admin, 'login.fail.bad_password', req, email, null);
    return res.status(401).json(INVALID_CREDENTIALS);
  }
  // ponytail: upgrade legacy scrypt admin hash to ArgonVault on first login.
  // The bootstrapped admin (env-supplied scrypt hash) lands here and rehashes
  // so subsequent logins go straight through Argon2id.
  if (needsRehash(admin.password)) {
    const rehashed = await hashPassword(password);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?').run(rehashed, admin.id);
    admin.password = rehashed;
  }
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
  const accessToken = generateAccessToken(admin);
  const refreshToken = generateRefreshToken(admin);
  auditAdmin(admin, 'login.ok', req, email, null);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({
    user: { id: admin.id, email: admin.email, first_name: admin.first_name, role: admin.role }
  });
}

// GET /admin/verify - Validate admin token. Used by the storefront admin
// panel on every page load instead of trusting a client-side sessionStorage flag.
app.get('/admin/verify', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  res.json({ authenticated: true, admin: { id: admin.id, email: admin.email } });
});

// GET /admin/audit - Admin-only. Returns recent audit log rows.
app.get('/admin/audit', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const rows = db.prepare(`
    SELECT id, admin_email, action, target, detail, ip, created_at
    FROM admin_audit_log
    ORDER BY created_at DESC
    LIMIT 200
  `).all();
  res.json({ rows });
});

// POST /admin/logout - Same as /logout but admin-aware (logs to audit log).
app.post('/admin/logout', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  auditAdmin(admin, 'logout', req, admin.email, null);
  const token = req.cookies?.[COOKIE_REFRESH];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET + '_refresh', { algorithms: ['HS256'] });
      db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE jti = ?").run(decoded.jti);
    } catch { /* ignore */ }
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

bootstrapAdmin();

// ponytail: never leak HTML stack traces OR internal messages to API clients.
// The message is fixed; the detail goes to the server log. Express 4 does not
// catch rejected promises, so every async handler is funnelled through here.
//
// ponytail: this MUST be the last middleware. Express searches forward only,
// so an error in any route registered after this would reach Express's
// default HTML error page (which prints the stack trace) instead of here.
app.use((err, req, res, next) => {
  console.error('[auth] Unhandled error:', err && err.message);
  if (res.headersSent) return next(err);
  const status = Number(err && (err.status || err.statusCode));
  // A body-parser failure (malformed JSON, oversized body) already carries a
  // 4xx status — honour it instead of turning it into a 500.
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: 'Invalid request' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ponytail: build the timing-equalisation hash BEFORE listening, so the very
// first login of an unknown address costs the same as a real one.
initDummyHash().finally(() => {
  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));
});
