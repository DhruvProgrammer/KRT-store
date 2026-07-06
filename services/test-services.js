const http = require('http');

const tests = [
  { p: 3002, u: '/register', m: 'POST', b: { email: 'test@krt.store', password: 'secret123', name: 'Test User' } },
  { p: 3003, u: '/products', m: 'GET' },
  { p: 3004, u: '/', m: 'GET', h: { 'x-user-id': 'test-123' } },
  { p: 3005, u: '/', m: 'GET', h: { 'x-user-id': 'test-123' } },
  { p: 3006, u: '/', m: 'POST', b: { amount: 99, currency: 'USD' } },
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
