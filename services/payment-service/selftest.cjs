// ponytail: the check that keeps the payment service's promise -- the amount
// is derived from the catalog, never taken from the client, and a retry does
// not charge twice. No framework, no fixtures: a stub catalog in-process, the
// real service spawned as a child, assertions, exit code.
//
//   node services/payment-service/selftest.cjs

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const CATALOG = [
  { slug: 'clarity-plugin', name: 'Clarity Plugin', price: 24 },
  { slug: 'arcwise-template', name: 'Arcwise Template', price: 59 }
];

let passed = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name} :: ${detail}`);
    console.log(`  FAIL ${name}\n       ${detail}`);
  }
}

function jsonServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          parsed = null;
        }
        const out = handler(req, parsed, res) || {};
        res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out.body ?? {}));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function post(base, route, body, headers = {}) {
  const res = await fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function waitFor(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(base + '/', { method: 'GET' });
      if (res.status) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  const catalog = await jsonServer((req) =>
    req.url === '/products'
      ? { body: { products: CATALOG } }
      : { status: 404, body: { error: 'not found' } }
  );

  const payPort = 3406;
  const base = `http://127.0.0.1:${payPort}`;
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(payPort),
      NODE_ENV: 'development',
      CATALOG_SERVICE_URL: `http://127.0.0.1:${catalog.address().port}`
    },
    stdio: 'ignore'
  });

  try {
    if (!(await waitFor(base))) throw new Error('the payment service never came up');
    console.log('payment-service selftest');

    const email = { email: 'buyer@example.com', paymentMethod: 'stripe' };

    // --- 1. the amount is the server's ----------------------------------
    const priced = await post(base, '/', {
      items: [{ slug: 'clarity-plugin', quantity: 2, price: 1, name: 'free' }],
      currency: 'USD',
      metadata: email
    }, { 'Idempotency-Key': 'selftest-price' });
    check('a valid intent is created', priced.status === 201, `status ${priced.status} ${JSON.stringify(priced.body)}`);
    const intent = priced.body && priced.body.paymentIntent;
    check('the amount is the catalog total, not the posted one',
      intent && intent.amount === 48, JSON.stringify(intent && intent.amount));
    check('the posted price inside an item is ignored',
      intent && intent.items[0].price === 24, JSON.stringify(intent && intent.items));

    const withAmount = await post(base, '/', { amount: 1, currency: 'USD', metadata: email },
      { 'Idempotency-Key': 'selftest-amount' });
    check('a client-supplied amount is refused outright',
      withAmount.status === 400, `status ${withAmount.status}`);

    const nan = await post(base, '/', { amount: 'abc', currency: 'USD', metadata: email },
      { 'Idempotency-Key': 'selftest-nan' });
    check('a NaN amount is refused', nan.status === 400, `status ${nan.status}`);

    // --- 2. validation ---------------------------------------------------
    const cases = [
      ['a missing Idempotency-Key is refused', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: email }, {}],
      ['a missing email is refused', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: { paymentMethod: 'stripe' } }, { 'Idempotency-Key': 'k1' }],
      ['a bogus currency is refused', { items: [{ slug: 'clarity-plugin', quantity: 1 }], currency: 'XXX', metadata: email }, { 'Idempotency-Key': 'k2' }],
      ['an unknown slug is refused', { items: [{ slug: 'no-such-thing', quantity: 1 }], metadata: email }, { 'Idempotency-Key': 'k3' }],
      ['a quantity of 0 is refused', { items: [{ slug: 'clarity-plugin', quantity: 0 }], metadata: email }, { 'Idempotency-Key': 'k4' }],
      ['a fractional quantity is refused', { items: [{ slug: 'clarity-plugin', quantity: 1.5 }], metadata: email }, { 'Idempotency-Key': 'k5' }],
      ['a quantity over 99 is refused', { items: [{ slug: 'clarity-plugin', quantity: 100 }], metadata: email }, { 'Idempotency-Key': 'k6' }],
      ['an unknown metadata key is refused', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: { email: 'buyer@example.com', role: 'admin' } }, { 'Idempotency-Key': 'k7' }],
      ['a non-string metadata value is refused', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: { email: 'buyer@example.com', paymentMethod: { nested: true } } }, { 'Idempotency-Key': 'k8' }],
      ['a bogus payment method is refused', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: { email: 'buyer@example.com', paymentMethod: 'crypto' } }, { 'Idempotency-Key': 'k9' }],
      ['an empty items array is refused', { items: [], metadata: email }, { 'Idempotency-Key': 'k10' }],
      ['more than 20 lines are refused', { items: Array.from({ length: 21 }, () => ({ slug: 'clarity-plugin', quantity: 1 })), metadata: email }, { 'Idempotency-Key': 'k11' }],
      ['a total over $10,000 is refused', { items: Array.from({ length: 20 }, () => ({ slug: 'arcwise-template', quantity: 99 })), metadata: email }, { 'Idempotency-Key': 'k12' }]
    ];
    for (const [label, body, headers] of cases) {
      const res = await post(base, '/', body, headers);
      check(label, res.status === 400, `status ${res.status} ${JSON.stringify(res.body)}`);
    }

    // --- 3. idempotency --------------------------------------------------
    const first = await post(base, '/', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: email },
      { 'Idempotency-Key': 'retry-me' });
    const second = await post(base, '/', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: email },
      { 'Idempotency-Key': 'retry-me' });
    check('the first request creates an intent', first.status === 201, `status ${first.status}`);
    check('the retry returns the SAME intent',
      first.body && second.body
        && first.body.paymentIntent.id === second.body.paymentIntent.id,
      `${first.body && first.body.paymentIntent.id} vs ${second.body && second.body.paymentIntent.id}`);

    const different = await post(base, '/', { items: [{ slug: 'arcwise-template', quantity: 1 }], metadata: email },
      { 'Idempotency-Key': 'retry-me' });
    check('the same key with a different body is a 409', different.status === 409, `status ${different.status}`);

    // one customer cannot read another's intent
    const other = await post(base, '/', { items: [{ slug: 'clarity-plugin', quantity: 1 }], metadata: { email: 'someone.else@example.com', paymentMethod: 'stripe' } },
      { 'Idempotency-Key': 'retry-me' });
    check("another customer's key is a separate intent",
      other.status === 201
        && other.body.paymentIntent.id !== first.body.paymentIntent.id,
      `status ${other.status}`);

    // --- 4. capture ------------------------------------------------------
    const captured = await post(base, '/capture', { paymentIntentId: first.body.paymentIntent.id });
    check('the intent can be captured', captured.status === 200 && captured.body.paymentIntent.status === 'succeeded',
      `status ${captured.status}`);
    const twice = await post(base, '/capture', { paymentIntentId: first.body.paymentIntent.id });
    check('capturing twice is refused', twice.status === 400, `status ${twice.status}`);
    const bogus = await post(base, '/capture', { paymentIntentId: 'nope' });
    check('capturing an unknown intent is a 404', bogus.status === 404, `status ${bogus.status}`);
    const badId = await post(base, '/capture', { paymentIntentId: '<script>' });
    check('a malformed paymentIntentId is refused', badId.status === 400, `status ${badId.status}`);
  } finally {
    try { child.kill(); } catch { /* already gone */ }
    catalog.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
