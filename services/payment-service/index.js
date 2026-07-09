const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory Map for payment intents: id -> paymentIntent object
const paymentIntents = new Map();
let nextId = 1;

function getNextId() {
  return String(nextId++);
}

// POST / - Create payment intent
app.post('/', (req, res) => {
  const { amount, currency, orderId, metadata } = req.body;
  if (amount == null || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const id = getNextId();
  const pi = {
    id,
    amount: Number(amount),
    currency: (currency || 'USD').toUpperCase(),
    orderId: orderId || null,
    metadata: metadata || {},
    status: 'requires_capture',
    createdAt: new Date().toISOString(),
    capturedAt: null
  };

  paymentIntents.set(id, pi);
  res.status(201).json({ paymentIntent: pi });
});

// POST /capture - Capture payment
app.post('/capture', (req, res) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) {
    return res.status(400).json({ error: 'paymentIntentId is required' });
  }

  const pi = paymentIntents.get(paymentIntentId);
  if (!pi) {
    return res.status(404).json({ error: 'Payment intent not found' });
  }
  if (pi.status === 'succeeded') {
    return res.status(400).json({ error: 'Payment already captured' });
  }

  pi.status = 'succeeded';
  pi.capturedAt = new Date().toISOString();
  res.json({ paymentIntent: pi });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => console.log(`Payment Service running on port ${PORT}`));
