const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'krt-store-secret-key-dev';
const users = new Map(); // email -> user object
const refreshTokens = new Set();

function generateAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET + '_refresh', { expiresIn: '7d' });
}

// POST /register - Register new user
app.post('/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name required' });
  }
  if (users.has(email)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const user = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    email,
    password,
    name,
    role: 'CUSTOMER',
    createdAt: new Date().toISOString()
  };
  users.set(email, user);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  refreshTokens.add(refreshToken);

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken
  });
});

// POST /login - Login (returns JWT)
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  refreshTokens.add(refreshToken);

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
    const user = users.get(decoded.email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      authenticated: true
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));
