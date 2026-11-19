// robustness: the checkout money path — real order-service + real payment-service
// + real catalog-service (ports 3520–3522); stub auth-service; dead notification.
//
// Covers: normal, retry-after-response-loss, concurrent same-attempt retries,
// the last-item race (two concurrent buyers of the stock-1 product), an edge
// validation battery, adversarial (attempt-id forgery across users, client-
// supplied money/identity fields), and a stress case (20 concurrent orders).
//
//   node services/test/checkout-robustness.test.cjs

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GOOD = '123456';
const CATALOG_PORT = 3520;
const PAYMENT_PORT = 3522;
const ORDER_PORT = 3521;
const ORDER_BASE = `http://127.0.0.1:${ORDER_PORT}`;
const CATALOG_BASE = `http://127.0.0.1:${CATALOG_PORT}`;
const PAYMENT_BASE = `http://127.0.0.1:${PAYMENT_PORT}`;
let AUTH_BASE; // set once the stub auth starts (jsonServer listens on a random port)

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(`${name} :: ${detail}`); console.log(`  FAIL ${name}\n       ${detail}`); }
}

function jsonServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body || '{}'); } catch { parsed = null; }
        const out = handler(req, parsed, res) || {};
        res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out.body ?? {}));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
const port = (s) => s.address().port;

async function post(base, route, body, headers = {}) {
  const res = await fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  let json = null; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}
async function get(base, route, headers = {}) {
  const res = await fetch(base + route, { headers });
  let json = null; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}
async function up(base, route, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(base + route);
      if (res.status) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
const cookie = (token) => ({ Cookie: `krt_access=${token}` });

(async () => {
  // --- stub auth ------------------------------------------------------------
  const auth = await jsonServer((req, body) => {
    if (req.url === '/me') {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      return { body: { id: token, email: token, authenticated: true } };
    }
    if (req.url !== '/verify-otp') return { status: 404, body: { error: 'not found' } };
    if (body.otp === GOOD && body.purpose === 'checkout') return { body: { success: true } };
    return { status: 400, body: { error: 'Invalid or expired code' } };
  });
  AUTH_BASE = `http://127.0.0.1:${port(auth)}`;

  const children = [];
  const spawnService = (relPath, env) => {
    children.push(spawn(process.execPath, [path.join(ROOT, 'services', relPath)], {
      env: { ...process.env, ...env },
      stdio: 'ignore'
    }));
  };

  spawnService('catalog-service/index.js', { PORT: String(CATALOG_PORT), HOST: '127.0.0.1' });
  spawnService('payment-service/index.js', {
    PORT: String(PAYMENT_PORT), HOST: '127.0.0.1',
    CATALOG_SERVICE_URL: `http://127.0.0.1:${CATALOG_PORT}`
  });
  spawnService('order-service/index.js', {
    PORT: String(ORDER_PORT), HOST: '127.0.0.1',
    AUTH_SERVICE_URL: AUTH_BASE,
    CATALOG_SERVICE_URL: `http://127.0.0.1:${CATALOG_PORT}`,
    PAYMENT_SERVICE_URL: `http://127.0.0.1:${PAYMENT_PORT}`,
    NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:9',
    NOTIFY_TOKEN: 'robustness-selftest',
    NODE_ENV: 'development'
  });

  const cleanup = () => {
    for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
    auth.close();
  };

  const order = (email, attempt, extra = {}) => ({
    email, otp: GOOD, paymentMethod: 'stripe',
    items: [{ slug: 'clarity-plugin', quantity: 1 }],
    checkoutAttemptId: attempt, ...extra
  });

  try {
    if (!(await up(ORDER_BASE, '/') && await up(CATALOG_BASE, '/products') &&
          await up(PAYMENT_BASE, '/') && await up(AUTH_BASE, '/me'))) {
      throw new Error('a service never came up');
    }
    console.log('checkout-robustness: order + payment + catalog (real), auth (stub)');

    // --- A. normal ----------------------------------------------------------------
    const a0 = await post(ORDER_BASE, '/', {
      email: 'a0@example.com', otp: GOOD, paymentMethod: 'stripe',
      items: [{ slug: 'clarity-plugin', quantity: 1 }]
    });
    check('A0: a missing attempt id is accepted (server-generated)', a0.status === 201, `status ${a0.status}`);
    const a1 = await post(ORDER_BASE, '/', order('a1@example.com', 'attempt-A1'));
    check('A1 normal: order created, paid, catalog price, attempt id echoed',
      a1.status === 201 && a1.body.order && a1.body.order.status === 'paid'
        && a1.body.order.total === 24 && a1.body.order.checkoutAttemptId === 'attempt-A1',
      `status ${a1.status} body ${JSON.stringify(a1.body)}`);
    const a2 = await post(ORDER_BASE, '/', order('a2@example.com', 'x'.repeat(128)));
    check('A2: a 128-char attempt id is accepted (payment key fits)', a2.status === 201, `status ${a2.status}`);

    // --- B. retry after response loss ---------------------------------------------
    const b1 = await post(ORDER_BASE, '/', order('b1@example.com', 'attempt-B1'));
    const b2 = await post(ORDER_BASE, '/', order('b1@example.com', 'attempt-B1')); // response lost → retry
    check('B1: first attempt creates the order', b1.status === 201, `status ${b1.status}`);
    check('B2: the retry returns the SAME order',
      b2.status === 201 && b2.body.order && b2.body.order.id === b1.body.order.id,
      `${b2.status} vs ${b1.status}`);
    const bList = await get(ORDER_BASE, '/', { Cookie: 'krt_access=b1@example.com' });
    check('B3: exactly one order exists after the retry', bList.body.orders.length === 1, JSON.stringify(bList.body));
    const bNew = await post(ORDER_BASE, '/', order('b1@example.com', 'attempt-B2'));
    check('B4: a new attempt id creates a new order',
      bNew.status === 201 && bNew.body.order && bNew.body.order.id !== b1.body.order.id, `status ${bNew.status}`);

    // --- C. concurrent same-attempt retries ---------------------------------------
    const cBody = order('c1@example.com', 'attempt-C1');
    const [c1, c2] = await Promise.all([post(ORDER_BASE, '/', cBody), post(ORDER_BASE, '/', cBody)]);
    check('C1: concurrent retries of one attempt share the order',
      c1.status === 201 && c2.status === 201 && c1.body.order.id === c2.body.order.id,
      `${c1.status}/${c2.status}`);

    // --- D. the last item (arcwise-template: stock 1 in the real catalog) ----------
    const [d1, d2] = await Promise.all([
      post(ORDER_BASE, '/', { email: 'd1@example.com', otp: GOOD, paymentMethod: 'stripe', items: [{ slug: 'arcwise-template', quantity: 1 }], checkoutAttemptId: 'attempt-D1' }),
      post(ORDER_BASE, '/', { email: 'd2@example.com', otp: GOOD, paymentMethod: 'stripe', items: [{ slug: 'arcwise-template', quantity: 1 }], checkoutAttemptId: 'attempt-D2' })
    ]);
    check('D1: the last item is bought by exactly one buyer',
      [d1.status, d2.status].includes(201) && [d1.status, d2.status].includes(409)
        && new Set([d1.status, d2.status]).size === 2,
      `statuses ${d1.status}/${d2.status}`);
    const d3 = await post(ORDER_BASE, '/', { email: 'd3@example.com', otp: GOOD, paymentMethod: 'stripe', items: [{ slug: 'arcwise-template', quantity: 1 }], checkoutAttemptId: 'attempt-D3' });
    check('D2: after the last item is sold, the next attempt is refused', d3.status === 409, `status ${d3.status}`);

    // --- E. validation battery (all must be 400) -----------------------------------
    const base = (extra) => ({
      email: 'e@example.com', otp: GOOD, paymentMethod: 'stripe',
      items: [{ slug: 'clarity-plugin', quantity: 1 }], ...extra
    });
    const bad = [
      ['missing email', base({ email: undefined })],
      ['missing otp', base({ otp: undefined })],
      ['invalid email', base({ email: 'not-an-email' })],
      ['bad payment method', base({ paymentMethod: 'crypto' })],
      ['empty items', base({ items: [] })],
      ['unknown slug', base({ items: [{ slug: 'nope', quantity: 1 }] })],
      ['slug traversal', base({ items: [{ slug: '../x', quantity: 1 }] })],
      ['quantity 0', base({ items: [{ slug: 'clarity-plugin', quantity: 0 }] })],
      ['quantity -1', base({ items: [{ slug: 'clarity-plugin', quantity: -1 }] })],
      ['quantity 1.5', base({ items: [{ slug: 'clarity-plugin', quantity: 1.5 }] })],
      ['quantity 100', base({ items: [{ slug: 'clarity-plugin', quantity: 100 }] })],
      ['quantity string "5"', base({ items: [{ slug: 'clarity-plugin', quantity: '5' }] })],
      ['21 items', base({ items: Array.from({ length: 21 }, () => ({ slug: 'clarity-plugin', quantity: 1 })) })],
      ['attempt id empty string', base({ checkoutAttemptId: '' })],
      ['attempt id as number', base({ checkoutAttemptId: 12345 })],
      ['attempt id 256 chars', base({ checkoutAttemptId: 'a'.repeat(256) })],
      ['attempt id with a control char', base({ checkoutAttemptId: 'bad\u0000id' })]
    ];
    for (const [label, body] of bad) {
      const res = await post(ORDER_BASE, '/', body);
      check(`E: ${label} is refused (400)`, res.status === 400, `status ${res.status} body ${JSON.stringify(res.body)}`);
    }

    // --- F. adversarial -------------------------------------------------------------
    const f1 = await post(ORDER_BASE, '/', order('f1@example.com', 'attempt-F1'));
    const f2 = await post(ORDER_BASE, '/', order('f2@example.com', 'attempt-F1'));
    check('F1: an attempt id is not transferable — another user gets 409', f2.status === 409, `status ${f2.status}`);
    const f3 = await post(ORDER_BASE, '/', {
      email: 'f3@example.com', otp: GOOD, paymentMethod: 'stripe',
      items: [{ slug: 'clarity-plugin', quantity: 1 }],
      paymentIntentId: 'forged', userId: 'admin', total: 0, price: 0
    });
    check('F2: client-supplied money/identity fields are ignored',
      f3.status === 201
        && f3.body.order.total === 24
        && f3.body.order.paymentIntentId !== 'forged'
        && !('userId' in f3.body.order)
        && !('price' in f3.body.order),
      `status ${f3.status} body ${JSON.stringify(f3.body)}`);

    // --- G. stress: 20 concurrent orders of an unlimited product ---------------------
    const g1 = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post(ORDER_BASE, '/', order(`s${i}@example.com`, `attempt-S${i}`)))
    );
    check('G1: all 20 concurrent orders succeed (unlimited product)', g1.every((r) => r.status === 201),
      `statuses ${g1.map((r) => r.status).join(',')}`);
    const ids = new Set(g1.map((r) => r.body && r.body.order && r.body.order.id));
    check('G2: all stress orders are distinct', ids.size === 20, `distinct ${ids.size}`);
  } finally {
    cleanup();
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
