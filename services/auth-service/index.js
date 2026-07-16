const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

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

  CREATE TABLE IF NOT EXISTS otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

function hashOTP(otp) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET + '_refresh', { expiresIn: '7d' });
}

// Helper function to send OTP email via notification service
async function sendOTPEmail(email, otp, purpose = 'registration') {
  const html = renderOTPEmail(otp);
  const subject = 'Your KRT Store verification code';
  
  try {
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
        html: renderOTPEmail(otp),
        purpose: 'registration',
        store_name: 'KRT Store'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[auth] OTP email send failed:', error);
      throw new Error('Failed to send OTP email');
    }
    
    console.log(`[auth] OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error('[auth] OTP email error:', error.message);
    throw error;
  }
}

function renderOTPEmail(otp) {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;background:#0f1218;padding:32px 0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#161a22;border:1px solid #2a3140;border-radius:20px;overflow:hidden;">
    <tr>
      <td style="padding:28px 32px;background:linear-gradient(135deg,#00a2ff,#0078ff);">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.04em;">KRT Store</p>
        <p style="margin:4px 0 0;color:#e0f2ff;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Email verification</p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#f1f5f9;font-size:22px;font-weight:900;letter-spacing:-0.03em;">Verify your email</p>
        <p style="margin:0;color:#94a3b8;font-size:14px;">Use the code below to complete your registration. This code expires in 10 minutes.</p>
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
app.post('/send-otp', async (req, res) => {
  const { email, purpose = 'registration' } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Check if user already exists (for registration)
  if (purpose === 'registration') {
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
  }

  // Generate OTP
  const otp = generateOTP();
  const otpHash = require('crypto').createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
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
    // Clean up OTP on email failure
    db.prepare('DELETE FROM otps WHERE email = ? AND purpose = ?').run(email, purpose);
    return res.status(500).json({ error: 'Failed to send OTP email' });
  }
});

// POST /verify-otp - Verify OTP
app.post('/verify-otp', (req, res) => {
  const { email, otp, purpose = 'registration' } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  // Hash the provided OTP
  const otpHash = require('crypto').createHash('sha256').update(otp + 'krt-otp-salt').digest('hex');
  
  // Find valid OTP
  const otpRecord = db.prepare(`
    SELECT * FROM otps 
    WHERE email = ? AND purpose = ? AND otp_hash = ? AND datetime(expires_at) > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(email, purpose, require('crypto').createHash('sha256').update(otp + 'krt-otp-salt').digest('hex'));

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  // Delete used OTP
  db.prepare('DELETE FROM otps WHERE id = ?').run(otpRecord.id);

  res.json({ success: true, message: 'OTP verified successfully' });
});

// POST /register - Register new user (requires verified email)
app.post('/register', (req, res) => {
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
    password, 
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
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

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

// GET /me - Validate token and return user info
app.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = authHeader.substring(7);
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

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));