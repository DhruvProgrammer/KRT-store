// ponytail: the check that keeps the cart service's security promise true --
// the cart belongs to the session the SERVER verified, never to a header the
// client chose. No framework, no fixtures: one stub upstream in-process, the
// real service spawned as a child, assertions, exit code.
//
//   node services/cart-service/selftest.cjs
//
// It fails if x-user-id ever unlocks a cart, if a request without a session
// is answered, or if one visitor can read or delete another visitor's cart.

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

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

function port(server) {
  return server.address().port;
}

// A cookie the cart service can read: the auth service's httpOnly session.
function cookie(token) {
  return { Cookie: `krt_access=${token}` };
}

async function call(base, route, { method = 'GET', headers = {}, body = null } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
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
      const res = await fetch(base + '/');
      if (res.status) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  // --- the stubbed auth service -----------------------------------------
  // The real one answers GET /me with the signed-in user's email; the
  // stub only has to be honest about WHO a token belongs to.
  const SESSIONS = {
    'token-a': 'a@example.com',
    'token-b': 'b@example.com'
  };
  const auth = await jsonServer((req) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const email = SESSIONS[token] || (token.startsWith('token-') ? `${token}@example.com` : null);
    if (!email) return { status: 401, body: { error: 'Invalid or expired token' } };
    return { body: { id: email, email, authenticated: true } };
  });

  // --- the stubbed catalog service ---------------------------------------
  // The cart prices its lines from the catalog, never from the request.
  const CATALOG = [
    { slug: 'clarity-plugin', name: 'Clarity', price: 24 },
    { slug: 'arcwise-template', name: 'Arcwise', price: 59 }
  ];
  const catalog = await jsonServer((req) =>
    req.url === '/products'
      ? { body: { products: CATALOG } }
      : { status: 404, body: { error: 'not found' } }
  );

  const cartPort = 3404;
  const base = `http://127.0.0.1:${cartPort}`;
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(cartPort),
      NODE_ENV: 'development',
      AUTH_SERVICE_URL: `http://127.0.0.1:${port(auth)}`,
      CATALOG_SERVICE_URL: `http://127.0.0.1:${port(catalog)}`
    },
    stdio: 'ignore'
  });

  const cleanup = () => {
    try { child.kill(); } catch { /* already gone */ }
    auth.close();
    catalog.close();
  };

  try {
    if (!(await waitFor(base))) throw new Error('the cart service never came up');
    console.log('cart-service selftest');

    // --- 1. a session is required ---------------------------------------
    const noSession = await call(base, '/');
    check('a request without a session is refused',
      noSession.status === 401, `status ${noSession.status}`);

    const forged = await call(base, '/', { headers: { 'x-user-id': 'someone-elses-id' } });
    check('a forged x-user-id does not unlock a cart',
      forged.status === 401, `status ${forged.status}`);

    const bogus = await call(base, '/', { headers: cookie('not-a-session') });
    check('a bogus session cookie does not unlock a cart',
      bogus.status === 401, `status ${bogus.status}`);

    // --- 2. the owner is the verified session ---------------------------
    const added = await call(base, '/items', {
      method: 'POST',
      headers: { ...cookie('token-a'), 'x-user-id': 'someone-elses-id' },
      body: { slug: 'clarity-plugin', quantity: 1 }
    });
    check('an item can be added with a session', added.status === 201, `status ${added.status}`);
    check('the cart belongs to the session, not to the header',
      added.body && added.body.cart && added.body.cart.userId === 'a@example.com',
      JSON.stringify(added.body && added.body.cart));

    // --- 2b. the price is the catalog's, not the client's ----------------
    // A third session, so the two-session isolation checks below still start
    // from an empty cart.
    const priced = await call(base, '/items', {
      method: 'POST',
      headers: cookie('token-c'),
      body: { slug: 'arcwise-template', name: 'FREE PRODUCT', price: 0.01, quantity: 1 }
    });
    const pricedLine = priced.body && priced.body.cart && priced.body.cart.items[0];
    check('a client-supplied price is ignored',
      priced.status === 201 && pricedLine && pricedLine.price === 59,
      JSON.stringify(pricedLine));
    check('a client-supplied name is ignored',
      pricedLine && pricedLine.name === 'Arcwise',
      JSON.stringify(pricedLine));

    const unknown = await call(base, '/items', {
      method: 'POST',
      headers: cookie('token-c'),
      body: { slug: 'no-such-product', quantity: 1 }
    });
    check('an unknown slug is refused', unknown.status === 400, `status ${unknown.status}`);

    const badQty = await call(base, '/items', {
      method: 'POST',
      headers: cookie('token-c'),
      body: { slug: 'clarity-plugin', quantity: '1e1' }
    });
    check('a quantity that is not a number is refused', badQty.status === 400, `status ${badQty.status}`);

    const cCart = await call(base, '/', { headers: cookie('token-c') });
    check('the rejected lines left the cart alone',
      cCart.status === 200 && cCart.body.cart.items.length === 1,
      JSON.stringify(cCart.body && cCart.body.cart.items));

    const aCart = await call(base, '/', { headers: cookie('token-a') });
    check('the owner reads its own cart',
      aCart.status === 200 && aCart.body.cart.items.length === 1,
      JSON.stringify(aCart.body));

    // --- 3. two sessions, two carts --------------------------------------
    const bCart = await call(base, '/', { headers: cookie('token-b') });
    check('the second session gets its own empty cart',
      bCart.status === 200 && bCart.body.cart.items.length === 0,
      JSON.stringify(bCart.body));
    check('the second session is not the first one',
      bCart.body.cart.userId === 'b@example.com', JSON.stringify(bCart.body.cart));

    // --- 4. neither can touch the other's cart ---------------------------
    const bDelete = await call(base, '/items/clarity-plugin', {
      method: 'DELETE', headers: cookie('token-b')
    });
    check("the second session cannot delete the first one's item",
      bDelete.status === 200 && bDelete.body.cart.items.length === 0,
      JSON.stringify(bDelete.body));

    const aAfter = await call(base, '/', { headers: cookie('token-a') });
    check("the first session's cart is untouched",
      aAfter.body.cart.items.length === 1, JSON.stringify(aAfter.body.cart));

    const bUpdate = await call(base, '/items/clarity-plugin', {
      method: 'PUT', headers: cookie('token-b'), body: { quantity: 99 }
    });
    check("the second session cannot update the first one's item",
      bUpdate.status === 404, `status ${bUpdate.status}`);

    const bClear = await call(base, '/', { method: 'DELETE', headers: cookie('token-b') });
    check("clearing the second session's cart is allowed",
      bClear.status === 200 && bClear.body.cart.items.length === 0, JSON.stringify(bClear.body));

    const aStill = await call(base, '/', { headers: cookie('token-a') });
    check("clearing the second session's cart leaves the first one's alone",
      aStill.body.cart.items.length === 1, JSON.stringify(aStill.body.cart));

    // --- 5. the map is bounded -------------------------------------------
    // 1000 carts fit; the 1001st evicts the oldest.
    for (let i = 0; i < 1000; i++) {
      await call(base, '/', { headers: cookie(`token-filler-${i}`) });
    }
    const evicted = await call(base, '/', { headers: cookie('token-a') });
    check('the oldest cart is evicted when the map is full',
      evicted.body.cart.items.length === 0, JSON.stringify(evicted.body.cart));
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
