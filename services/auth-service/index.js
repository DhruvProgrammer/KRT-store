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
app.use(express.json());
app.use(cookieParser());

// ponytail: password policy. NIST 800-63B says length > complexity, but we
// keep a floor of 8 + a ceiling (prevent abuse) + a tiny blocklist. No
// "must contain uppercase+symbol" theater — that just annoys users without
// meaningfully raising entropy.
const WEAK_PASSWORDS = new Set(['password', '12345678', 'password1', 'qwerty12', 'letmein1', '11111111', '00000000', 'abc12345', 'iloveyou']);
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) return 'Password must be 8–128 characters';
  if (WEAK_PASSWORDS.has(pw.toLowerCase())) return 'Password is too common';
  return null;
}

// ponytail: in-memory rate limiter — no dep. Ceiling: resets on restart, not
// shared across instances. Upgrade path: swap for a Redis-backed limiter when
// the service scales past one process. key=identifier, max=N, windowMs=W.
function rateLimit({ max, windowMs }) {
  const hits = new Map();
  // ponytail: sweep every 5×window to avoid unbounded growth. Naive but fine
  // for a single-process dev/stage service.
  setInterval(() => hits.clear(), windowMs * 5).unref();
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    hits.set(ip, entry);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'krt-store-secret-key-dev';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8000';
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN || 'brunogoyal';
// ponytail: admin creds are env-only, never bundled. ADMIN_PASSWORD_HASH is a
// pre-hashed value (see scripts/hash-admin-password.js) — the server never
// sees the plaintext. ADMIN_BOOTSTRAP=true creates the admin row on first
// boot if no admin exists; flip it to false (or unset it) after the row exists.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_BOOTSTRAP = process.env.ADMIN_BOOTSTRAP === 'true';

// Initialize SQLite database
const db = new Database('auth.db');

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

  CREATE TABLE IF NOT EXISTS magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

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

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  const existing = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'ADMIN'").get(ADMIN_EMAIL);
  if (existing) return;
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, password, first_name, role, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, 'Admin', 'ADMIN', 1, datetime('now'), datetime('now'))
  `).run(id, ADMIN_EMAIL, ADMIN_PASSWORD_HASH);
  console.log(`[auth] Bootstrapped admin user ${ADMIN_EMAIL}`);
}

function auditAdmin(admin, action, req, target, detail) {
  try {
    db.prepare(`
      INSERT INTO admin_audit_log (admin_id, admin_email, action, target, detail, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      admin?.id || null,
      admin?.email || null,
      action,
      target || null,
      detail ? JSON.stringify(detail) : null,
      req?.ip || req?.headers?.['x-forwarded-for'] || null,
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
    const decoded = jwt.verify(token, JWT_SECRET);
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
async function sendMagicLinkEmail(email, token, purpose = 'signin') {
  const subject = 'Your KRT Store sign-in link';
  const magicLink = `${process.env.FRONTEND_URL || 'http://localhost:4321'}/auth/verify-magic?token=${token}&email=${encodeURIComponent(email)}`;

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
      body: JSON.stringify({
        email,
        subject,
        token,
        html: renderMagicLinkEmail(magicLink, email),
        purpose,
        store_name: 'KRT Store'
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

function renderMagicLinkEmail(magicLink, email) {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;background:#0f1218;padding:32px 0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#161a22;border:1px solid #2a3140;border-radius:20px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg,#00a2ff,#0078ff);">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">KRT Store</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Sign in with magic link</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">Sign in to your account</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">Click the button below to sign in securely. This link expires in 15 minutes.</p>
        <div style="margin:24px 0;text-align:center;">
          <a href="${magicLink}" style="display:inline-block;padding:16px 32px;background:#00a2ff;color:#0f1218;font-size:16px;font-weight:900;text-decoration:none;border-radius:12px;letter-spacing:0.02em;">Sign in to KRT Store</a>
        </div>
        <p style="margin:24px 0 0;padding:16px 18px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;color:#94a3b8;font-size:13px;line-height:1.6;">
          If you didn't request this link, you can safely ignore this email. The link will expire automatically.
          <br><br>
          <strong>Link:</strong> ${magicLink}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #2a3140;color:#64748b;font-size:12px;text-align:center;">
        © KRT Store. This is an automated sign-in email.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Helper function to send OTP email via notification service
async function sendOTPEmail(email, otp, purpose = 'registration') {
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
      body: JSON.stringify({
        email,
        subject,
        otp: otp,
        html: renderOTPEmail(otp, purpose),
        purpose,
        store_name: 'KRT Store'
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

function renderOTPEmail(otp, purpose = 'registration') {
  const isLogin = purpose === 'login';
  const eyebrow = isLogin ? 'Sign-in verification' : 'Email verification';
  const title = isLogin ? 'Confirm your sign-in' : 'Verify your email';
  const intro = isLogin
    ? 'Use the code below to finish signing in to your account. This code expires in 10 minutes.'
    : 'Use the code below to complete your registration. This code expires in 10 minutes.';

  return `<!doctype html>
<html lang="en">
<body style="margin:0;background:#0f1218;padding:32px 0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#161a22;border:1px solid #2a3140;border-radius:20px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg,#00a2ff,#0078ff);">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">KRT Store</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">${eyebrow}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">${title}</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">${intro}</p>
        <div style="margin:24px 0;text-align:center;">
          <span style="display:inline-block;padding:16px 32px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;color:#00a2ff;font-size:32px;font-weight:900;letter-spacing:0.3em;font-family:monospace;">${otp}</span>
        </div>
        <p style="margin:24px 0 0;padding:16px 18px;background:#1f2430;border:1px solid #2a3140;border-radius:14px;color:#94a3b8;font-size:13px;line-height:1.6;">
          If you didn't request this code, you can safely ignore this email. The code will expire automatically.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #2a3140;color:#64748b;font-size:12px;text-align:center;">
        © KRT Store. This is an automated verification email.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// POST /send-otp - Send OTP to email
// ponytail: 5/min per IP — email-sending is the expensive+abusable resource.
const sendOtpLimiter = rateLimit({ max: 5, windowMs: 60_000 });
app.post('/send-otp', sendOtpLimiter, async (req, res) => {
  const { email, purpose = 'registration' } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check if user already exists (for registration) or must exist (for login)
  if (purpose === 'registration') {
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
  } else if (purpose === 'login') {
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!existingUser) {
      return res.status(404).json({ error: 'No account found for this email' });
    }
  }

  // Generate OTP
  const otp = generateOTP();
  const otpHash = crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // Store OTP in database
  const stmt = db.prepare(`
    INSERT INTO otps (email, otp_hash, purpose, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(email, otpHash, purpose, expiresAt);

  // Send OTP email
  try {
    await sendOTPEmail(email, otp, purpose);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    // ponytail: in dev, email delivery is optional — keep the OTP and surface it
    // so signup/login still works locally without a configured mailer.
    if (process.env.NODE_ENV === 'production') {
      db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(email, purpose);
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }
    console.log(`[auth][dev] OTP for ${email} (${purpose}): ${otp}`);
    res.json({ success: true, devOtp: otp, message: 'OTP sent (dev mode: check server console)' });
  }
});

// POST /verify-otp - Verify OTP
app.post('/verify-otp', (req, res) => {
  const { email, otp, purpose = 'registration' } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  // Hash the provided OTP
  const otpHash = crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
  
  // Find valid OTP
  const otpRecord = db.prepare(`
    SELECT * FROM otps 
    WHERE email = ? AND purpose = ? AND otp_hash = ? AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(email, purpose, crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex'));

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  // Delete used OTP
  db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);

  res.json({ success: true, message: 'OTP verified successfully' });
});

// POST /register - Register new user (requires verified email)
app.post('/register', async (req, res) => {
  const { 
    email, 
    password, 
    first_name, 
    last_name, 
    phone, 
    rating,
    otp 
  } = req.body;
  
  if (!email || !password || !first_name || !otp) {
    return res.status(400).json({ 
      error: 'Email, password, first name, and OTP are required' 
    });
  }

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  // Verify OTP
  const crypto = require('crypto');
  const otpHash = crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
  
  const otpRecord = db.prepare(`
    SELECT * FROM otps 
    WHERE email = ? AND purpose = 'registration' AND otp_hash = ? AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(email, otpHash);

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  // Check if user already exists
  const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return res.status(409).json({ error: 'User already exists' });
  }

  // Create user
  const userId = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password, first_name, last_name, phone, rating, email_verified, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'CUSTOMER', datetime('now'), datetime('now'))
  `);
  stmt.run(
    userId, 
    email, 
    await hashPassword(password), 
    first_name, 
    last_name || null, 
    phone || null, 
    rating || null
  );

  // Delete used OTP
  db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(email, 'registration');

  // Get the created user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role });

  setAuthCookies(res, accessToken, refreshToken);
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      rating: user.rating,
      role: user.role
    },
    accessToken,
    refreshToken
  });
});

// POST /login - Login (returns JWT)
// ponytail: 10/min per IP — blocks credential stuffing while letting legit
// fat-finger retries through.
const loginLimiter = rateLimit({ max: 10, windowMs: 60_000 });
app.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user || !await verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
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
      rating: user.rating,
      role: user.role
    },
    accessToken,
    refreshToken
  });
});

// POST /login-otp - Passwordless sign-in via OTP (returns JWT)
// ponytail: 10/min per IP — 6-digit OTP × 10 attempts is 1e-6 brute-force odds.
const loginOtpLimiter = rateLimit({ max: 10, windowMs: 60_000 });
app.post('/login-otp', loginOtpLimiter, (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(404).json({ error: 'No account found for this email' });
  }

  const otpHash = crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
  const otpRecord = db.prepare(`
    SELECT * FROM otps
    WHERE email = ? AND purpose = 'login' AND otp_hash = ? AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(email, otpHash);

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
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
      rating: user.rating,
      role: user.role
    },
    accessToken,
    refreshToken
  });
});

// POST /send-magic-link - Send magic link for passwordless sign-in
// ponytail: 5/min per IP — same email-sending abuse vector as send-otp.
const magicLinkLimiter = rateLimit({ max: 5, windowMs: 60_000 });
app.post('/send-magic-link', magicLinkLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check if user exists (only registered users can use magic links)
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    // Don't reveal if email exists — return generic success for security
    return res.json({ success: true, message: 'If the email exists, a sign-in link has been sent' });
  }

  // Generate and store magic link token
  const token = generateMagicToken();
  const tokenHash = hashMagicToken(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  db.prepare(`
    INSERT INTO magic_links (email, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(email, tokenHash, expiresAt);

  // Send magic link email
  try {
    await sendMagicLinkEmail(email, token, 'signin');
    res.json({ success: true, message: 'If the email exists, a sign-in link has been sent' });
  } catch (error) {
    // Clean up on email failure
    db.prepare('DELETE FROM magic_links WHERE email = ?').run(email);
    return res.status(500).json({ error: 'Failed to send magic link email' });
  }
});

// POST /verify-magic-link - Verify magic link and return JWT
app.post('/verify-magic-link', (req, res) => {
  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required' });
  }

  const tokenHash = hashMagicToken(token);
  const magicLink = db.prepare(`
    SELECT * FROM magic_links
    WHERE email = ? AND token_hash = ? AND expires_at > datetime('now') AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email, tokenHash);

  if (!magicLink) {
    return res.status(400).json({ error: 'Invalid or expired magic link' });
  }

  // Mark as used
  db.prepare('UPDATE magic_links SET used = 1 WHERE id = ?').run(magicLink.id);

  // Get user
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
      rating: user.rating,
      role: user.role
    },
    accessToken,
    refreshToken
  });
});

// GET /me - Validate token (Bearer header OR httpOnly cookie) and return user info
app.get('/me', (req, res) => {
  const token = readAccessToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(decoded.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      rating: user.rating,
      role: user.role,
      authenticated: true
    });
  } catch (err) {
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
    decoded = jwt.verify(token, JWT_SECRET + '_refresh');
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
  const row = db.prepare('SELECT user_id, revoked_at FROM refresh_tokens WHERE jti = ?').get(decoded.jti);
  if (!row || row.revoked_at) {
    return res.status(401).json({ error: 'Refresh token revoked' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // Revoke the used refresh token, then mint a new pair.
  db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE jti = ?").run(decoded.jti);
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
      const decoded = jwt.verify(token, JWT_SECRET + '_refresh');
      db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE jti = ?").run(decoded.jti);
    } catch { /* expired token — nothing to revoke */ }
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

// ponytail: never leak HTML stack traces to API clients — always respond JSON.
app.use((err, req, res, next) => {
  console.error('[auth] Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

// POST /admin/login - Admin sign-in. Constant-time password compare via
// verifyPassword(). Logs every attempt (success + failure) to admin_audit_log.
// ponytail: 5/min per IP — tighter than user login; admin is the crown jewels.
const adminLoginLimiter = rateLimit({ max: 5, windowMs: 60_000 });
app.post('/admin/login', adminLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const admin = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'ADMIN'").get(email);
  if (!admin) {
    auditAdmin({ email }, 'login.fail.no_user', req, email, { reason: 'no_admin_with_email' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!await verifyPassword(password, admin.password)) {
    auditAdmin(admin, 'login.fail.bad_password', req, email, null);
    return res.status(401).json({ error: 'Invalid credentials' });
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
    user: { id: admin.id, email: admin.email, first_name: admin.first_name, role: admin.role },
    accessToken,
    refreshToken
  });
});

// GET /admin/verify - Validate admin token. Used by the storefront admin
// panel on every page load instead of trusting a client-side sessionStorage flag.
app.get('/admin/verify', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  res.json({ authenticated: true, admin: { id: admin.id, email: admin.email } });
});

// GET /admin/audit - Owner-only. Returns recent audit log rows.
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
      const decoded = jwt.verify(token, JWT_SECRET + '_refresh');
      db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE jti = ?").run(decoded.jti);
    } catch { /* ignore */ }
  }
  clearAuthCookies(res);
  res.json({ success: true });
});

bootstrapAdmin();

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));