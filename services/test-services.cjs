const http = require('http');

// ponytail: the smoke test follows the CURRENT contracts:
//  - the auth service still takes an email/password for /register (it also
//    needs an OTP, so this call is expected to answer 400)
//  - the CART and ORDER services are keyed on the server-verified session, so
//    a request without one is refused with 401. That refusal IS the expected
//    result -- there is no x-user-id header to pass any more.
//  - the PAYMENT service no longer takes an amount from the client -- the
//    amount is derived from the catalog, so the body carries items only.
const tests = [
  { p: 3002, u: '/register', m: 'POST', b: { email: 'test@krt.store', password: 'secret123', name: 'Test User' } },
  { p: 3003, u: '/products', m: 'GET' },
  { p: 3004, u: '/', m: 'GET' },
  { p: 3005, u: '/', m: 'GET' },
  {
    p: 3006,
    u: '/',
    m: 'POST',
    b: { items: [{ slug: 'clarity-plugin', quantity: 1 }], currency: 'USD', metadata: { email: 'test@krt.store', paymentMethod: 'stripe' } },
    h: { 'Idempotency-Key': 'smoke-test-' + Date.now() }
  },
  { p: 3001, u: '/health', m: 'GET' }
];

let i = 0;
function next() {
  if (i >= tests.length) {
    console.log('--- All tests done ---');
    return;
  }
  const t = tests[i++];
  const opts = {
    hostname: 'localhost',
    port: t.p,
    path: t.u,
    method: t.m,
    headers: { 'Content-Type': 'application/json' }
  };
  if (t.h) Object.assign(opts.headers, t.h);

  const req = http.request(opts, (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log(`PORT ${t.p} ${t.m} ${t.u} -> ${res.statusCode}: ${d.slice(0, 120)}`);
      next();
    });
  });
  req.on('error', e => {
    console.log(`PORT ${t.p} ERROR: ${e.message}`);
    next();
  });
  if (t.b) req.write(JSON.stringify(t.b));
  req.end();
}
next();
