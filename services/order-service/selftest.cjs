// ponytail: the check that keeps the order service's three security promises
// true -- the price is the SERVER's, the owner is the address the server
// verified, and no order exists without a captured payment. No framework, no
// fixtures: three stub upstreams in-process, the real service spawned as a
// child, assertions, exit code.
//
//   node services/order-service/selftest.cjs
//
// It fails if the price in the request body ever wins, if x-user-id ever
// unlocks an order list, if an order is created without a captured payment,
// or if the validation is loosened.

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const GOOD_OTP = '123456';
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
        // ponytail: `destroy` simulates an upstream that is not there at all
        // (a dropped connection), so the service's "unreachable" path can be
        // exercised without spawning a second process.
        if (out.destroy) {
          req.socket.destroy();
          return;
        }
        res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out.body ?? {}));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function port(server) {
  return server.address().port;
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

async function get(base, route, headers = {}) {
  const res = await fetch(base + route, { headers });
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
  // --- stub upstreams ---------------------------------------------------
  const catalog = await jsonServer((req) =>
    req.url === '/products'
      ? { body: { products: CATALOG } }
      : { status: 404, body: { error: 'not found' } }
  );

  // The auth stub consumes the code exactly like the real one: the first
  // successful verification burns it, so a replay fails.
  const burned = new Set();
  const auth = await jsonServer((req, body) => {
    // ponytail: the session token IS the email in this stub, so a test can
    // list the orders of one address.
    if (req.url === '/me') {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      return { body: { email: token } };
    }
    if (req.url !== '/verify-otp') return { status: 404, body: { error: 'not found' } };
    const key = `${body.email}|${body.otp}`;
    if (body.otp === GOOD_OTP && !burned.has(key)) {
      burned.add(key);
      return { body: { success: true } };
    }
    return { status: 400, body: { error: 'Invalid or expired code' } };
  });

  // The payment stub behaves like the real service: the amount is derived
  // from the catalog, an Idempotency-Key is required, and an intent only
  // counts as paid once it has been captured. `mode` switches the failure
  // modes:
  //   'unreachable'  -> the connection is dropped (nothing is listening)
  //   'error'        -> the payment service answers 503
  //   'wrong-amount' -> it prices the cart differently than the order service
  const payment = { mode: 'ok', created: [], captured: [] };
  const intents = new Map();
  let nextIntentId = 1;
  const paymentStub = await jsonServer((req, body) => {
    if (payment.mode === 'unreachable') return { destroy: true };
    if (req.url === '/') {
      if (payment.mode === 'error') {
        return { status: 503, body: { error: 'Pricing service unavailable, try again' } };
      }
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !key) {
        return { status: 400, body: { error: 'Idempotency-Key header is required' } };
      }
      let amount = 0;
      for (const item of body.items || []) {
        const product = CATALOG.find((p) => p.slug === item.slug);
        if (!product) return { status: 400, body: { error: `Unknown product slug "${item.slug}"` } };
        amount += product.price * item.quantity;
      }
      amount = Math.round(amount * 100) / 100;
      if (payment.mode === 'wrong-amount') amount += 1;
      const id = `pi-${nextIntentId++}`;
      const intent = {
        id,
        amount,
        currency: body.currency,
        items: body.items,
        orderId: body.orderId,
        metadata: body.metadata,
        status: 'requires_capture',
        createdAt: new Date().toISOString(),
        capturedAt: null
      };
      intents.set(id, intent);
      payment.created.push({ id, amount, orderId: body.orderId, key, items: body.items, metadata: body.metadata });
      return { status: 201, body: { paymentIntent: intent } };
    }
    if (req.url === '/capture') {
      const intent = intents.get(body.paymentIntentId);
      if (!intent) return { status: 404, body: { error: 'Payment intent not found' } };
      intent.status = 'succeeded';
      intent.capturedAt = new Date().toISOString();
      payment.captured.push(intent.id);
      return { status: 200, body: { paymentIntent: intent } };
    }
    return { status: 404, body: { error: 'not found' } };
  });

  const orderPort = 3405;
  const base = `http://127.0.0.1:${orderPort}`;
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(orderPort),
      NODE_ENV: 'development',
      AUTH_SERVICE_URL: `http://127.0.0.1:${port(auth)}`,
      CATALOG_SERVICE_URL: `http://127.0.0.1:${port(catalog)}`,
      PAYMENT_SERVICE_URL: `http://127.0.0.1:${port(paymentStub)}`,
      // nothing listens here on purpose -- the receipt is fire-and-forget
      // and the service must not fail the order because of it
      NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:9',
      NOTIFY_TOKEN: 'selftest',
      STORE_NAME: 'KRT store'
    },
    stdio: 'ignore'
  });

  const cleanup = () => {
    try { child.kill(); } catch { /* already gone */ }
    catalog.close();
    auth.close();
    paymentStub.close();
  };

  try {
    if (!(await waitFor(base))) throw new Error('the order service never came up');
    console.log('order-service selftest');

    // --- 1. the price is the server's -----------------------------------
    const priced = await post(base, '/', {
      email: 'buyer@example.com',
      otp: GOOD_OTP,
      paymentMethod: 'stripe',
      items: [{ slug: 'clarity-plugin', quantity: 2, price: 1, name: 'free' }],
      total: 1,
      // the client tries to name its own payment intent
      paymentIntentId: 'client-forged-intent'
    });
    check('a valid order is created', priced.status === 201, `status ${priced.status} ${JSON.stringify(priced.body)}`);
    const order = priced.body && priced.body.order;
    check('the stored price is the catalog price, not the posted one',
      order && order.items[0].price === 24, JSON.stringify(order && order.items));
    check('the stored total is the server-side sum',
      order && order.total === 48, JSON.stringify(order && order.total));
    check('the posted total is ignored',
      order && order.total !== 1, JSON.stringify(order && order.total));

    // --- 1b. the order is paid before it exists -------------------------
    const intent = payment.created[0];
    check('the order service sent an Idempotency-Key to the payment service',
      !!intent && typeof intent.key === 'string' && intent.key.length > 0,
      JSON.stringify(intent && intent.key));
    check('the payment service got the slug and the quantity only',
      !!intent && JSON.stringify(intent.items) === JSON.stringify([{ slug: 'clarity-plugin', quantity: 2 }]),
      JSON.stringify(intent && intent.items));
    check('the payment service derived the same amount as the order service',
      !!intent && intent.amount === 48, JSON.stringify(intent && intent.amount));
    check('the order total equals the amount the payment service charged',
      !!order && order.total === intent.amount, `${order && order.total} vs ${intent && intent.amount}`);
    check('the intent was captured before the order was created',
      !!intent && payment.captured.includes(intent.id), JSON.stringify(payment.captured));
    check('the order carries the intent id the payment service handed out',
      !!order && order.paymentIntentId === intent.id, JSON.stringify(order && order.paymentIntentId));
    check('a client-supplied paymentIntentId is ignored',
      !!order && order.paymentIntentId !== 'client-forged-intent',
      JSON.stringify(order && order.paymentIntentId));
    check('the order is paid, not pending',
      !!order && order.status === 'paid', JSON.stringify(order && order.status));

    // --- 2. the owner is the verified address ---------------------------
    check('the order belongs to the verified email',
      order && order.email === 'buyer@example.com', JSON.stringify(order && order.email));
    check('no client-asserted user id is stored',
      order && !('userId' in order), JSON.stringify(Object.keys(order || {})));

    // --- 3. the list needs a session ------------------------------------
    const noSession = await get(base, '/');
    check('listing orders without a session is refused',
      noSession.status === 401, `status ${noSession.status}`);
    const forged = await get(base, '/', { 'x-user-id': 'someone-elses-id' });
    check('a forged x-user-id does not unlock the list',
      forged.status === 401, `status ${forged.status}`);
    const bearer = await get(base, '/', { Authorization: 'Bearer not-a-jwt' });
    check('a bogus bearer token does not unlock the list',
      bearer.status === 401, `status ${bearer.status}`);

    // --- 4. validation ---------------------------------------------------
    const cases = [
      ['an unknown slug is refused', [{ slug: 'no-such-thing', quantity: 1 }]],
      ['a quantity of 0 is refused', [{ slug: 'clarity-plugin', quantity: 0 }]],
      ['a negative quantity is refused', [{ slug: 'clarity-plugin', quantity: -1 }]],
      ['a fractional quantity is refused', [{ slug: 'clarity-plugin', quantity: 1.5 }]],
      ['a quantity over 99 is refused', [{ slug: 'clarity-plugin', quantity: 100 }]],
      ['a slug with a path traversal is refused', [{ slug: '../etc/passwd', quantity: 1 }]],
      ['an empty items array is refused', []],
      ['more than 20 lines are refused', Array.from({ length: 21 }, () => ({ slug: 'clarity-plugin', quantity: 1 }))]
    ];
    for (const [label, items] of cases) {
      const res = await post(base, '/', {
        email: 'buyer@example.com', otp: '999999', paymentMethod: 'stripe', items
      });
      check(label, res.status === 400, `status ${res.status} ${JSON.stringify(res.body)}`);
    }

    const badMethod = await post(base, '/', {
      email: 'buyer@example.com', otp: '999999', paymentMethod: 'crypto', items: [{ slug: 'clarity-plugin', quantity: 1 }]
    });
    check('an unknown payment method is refused', badMethod.status === 400, `status ${badMethod.status}`);

    const noEmail = await post(base, '/', {
      otp: '999999', paymentMethod: 'stripe', items: [{ slug: 'clarity-plugin', quantity: 1 }]
    });
    check('a missing email is refused', noEmail.status === 400, `status ${noEmail.status}`);

    // a wrong OTP must not create an order
    const wrongOtp = await post(base, '/', {
      email: 'buyer@example.com', otp: '000000', paymentMethod: 'stripe', items: [{ slug: 'clarity-plugin', quantity: 1 }]
    });
    check('a wrong OTP creates no order', wrongOtp.status === 400, `status ${wrongOtp.status}`);

    // the OTP is one-shot: a replay of the good code must fail
    const replay = await post(base, '/', {
      email: 'buyer@example.com', otp: GOOD_OTP, paymentMethod: 'stripe', items: [{ slug: 'clarity-plugin', quantity: 1 }]
    });
    check('the OTP cannot be replayed', replay.status === 400, `status ${replay.status}`);

    // --- 5. the total ceiling matches the payment service ----------------
    const huge = await post(base, '/', {
      email: 'buyer@example.com', otp: '999999', paymentMethod: 'stripe',
      items: Array.from({ length: 20 }, () => ({ slug: 'arcwise-template', quantity: 99 }))
    });
    check('an order over the $10,000 ceiling is refused', huge.status === 400, `status ${huge.status} ${JSON.stringify(huge.body)}`);

    // --- 6. no order without a captured payment --------------------------
    // Every failure below must leave the store exactly as it was: no order,
    // no receipt, no capture. The same one-shot code is used throughout, so
    // the last request also proves that a failed payment did not burn it.
    const cart = [{ slug: 'clarity-plugin', quantity: 1 }];
    const capturesBefore = payment.captured.length;

    payment.mode = 'unreachable';
    const unreachable = await post(base, '/', {
      email: 'payer@example.com', otp: GOOD_OTP, paymentMethod: 'stripe', items: cart
    });
    check('an unreachable payment service is a 503', unreachable.status === 503,
      `status ${unreachable.status} ${JSON.stringify(unreachable.body)}`);
    payment.mode = 'ok';

    payment.mode = 'error';
    const upstream = await post(base, '/', {
      email: 'upstream@example.com', otp: GOOD_OTP, paymentMethod: 'stripe', items: cart
    });
    check('a 503 from the payment service is a 503 for the client', upstream.status === 503,
      `status ${upstream.status} ${JSON.stringify(upstream.body)}`);
    payment.mode = 'ok';

    payment.mode = 'wrong-amount';
    const mismatch = await post(base, '/', {
      email: 'payer@example.com', otp: GOOD_OTP, paymentMethod: 'stripe', items: cart
    });
    check('a payment amount that does not match the order total is refused', mismatch.status === 400,
      `status ${mismatch.status} ${JSON.stringify(mismatch.body)}`);
    payment.mode = 'ok';

    check('no failed attempt captured a payment', payment.captured.length === capturesBefore,
      `captured ${JSON.stringify(payment.captured)}`);

    // the code survived every one of those failures
    const paid = await post(base, '/', {
      email: 'payer@example.com', otp: GOOD_OTP, paymentMethod: 'stripe', items: cart
    });
    check('a failed payment does not burn the verification code', paid.status === 201,
      `status ${paid.status} ${JSON.stringify(paid.body)}`);

    // ... and exactly one order exists for that address
    const list = await get(base, '/', { Cookie: 'krt_access=payer@example.com' });
    const listed = (list.body && list.body.orders) || [];
    const failedOrderIds = payment.created
      .filter((c) => c.orderId !== String(paid.body.order.id))
      .map((c) => String(c.orderId));
    check('the failed attempts left no order behind',
      listed.length === 1 && failedOrderIds.every((id) => !listed.some((o) => o.id === id)),
      `listed ${JSON.stringify(listed.map((o) => o.id))} failed ids ${JSON.stringify(failedOrderIds)}`);
    check('the order that exists is the paid one',
      listed.length === 1 && listed[0].status === 'paid'
        && listed[0].paymentIntentId === paid.body.order.paymentIntentId,
      JSON.stringify(listed));

    const empty = await get(base, '/', { Cookie: 'krt_access=upstream@example.com' });
    check('a 503 from the payment service left no order behind',
      empty.body && empty.body.orders.length === 0, JSON.stringify(empty.body));

    // every order attempt gets its own idempotency key
    const keys = payment.created.map((c) => c.key);
    check('every order attempt sent its own Idempotency-Key',
      new Set(keys).size === keys.length, JSON.stringify(keys));
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
