// ponytail: the rate limiter's tier match must be case-insensitive, because
// Express's app.use() routing is. Proven: 8/8 POSTs to /API/ORDERS reached
// the order service while the cap was 5/min -- one capitalised letter walked
// straight past the strictest tier in the table.
//
// It also pins the routes that were REMOVED: the mailer and the payment
// service are internal-only. If a future change re-exposes /api/notify, the
// store becomes an open email relay again (the mailer sends REAL Gmail, and
// its x-notify-token was once committed to this repository).
//
//   node services/api-gateway/rate-limit.test.cjs

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function request(port, method, route, headers = {}, body = null) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: route, method, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: d,
            limit: Number(res.headers['x-ratelimit-limit'])
          })
        );
      }
    );
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e), limit: NaN }));
    if (body) req.write(body);
    req.end();
  });
}

async function waitFor(port) {
  for (let i = 0; i < 80; i++) {
    const r = await request(port, 'GET', '/health');
    if (r.status) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function startGateway(port) {
  return spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'http://localhost:4321',
      AUTH_SERVICE_URL: 'http://127.0.0.1:3002',
      CATALOG_SERVICE_URL: 'http://127.0.0.1:3003',
      CART_SERVICE_URL: 'http://127.0.0.1:3004',
      ORDER_SERVICE_URL: 'http://127.0.0.1:3005',
      PAYMENT_SERVICE_URL: 'http://127.0.0.1:3006',
      NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:8000',
      TRUST_PROXY: ''
    },
    stdio: 'ignore'
  });
}

(async () => {
  let failed = 0;
  const check = (name, cond, detail = '') => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '\n       ' + detail}`);
    if (!cond) failed++;
  };

  const PORT = 3510;
  const child = startGateway(PORT);
  try {
    if (!(await waitFor(PORT))) throw new Error('the gateway did not start');
    console.log('gateway rate-limit tier matching');

    // --- 1. the tier must not depend on the case of the path -------------
    const lower = await request(PORT, 'GET', '/api/orders');
    const upper = await request(PORT, 'GET', '/API/ORDERS');
    const mixed = await request(PORT, 'GET', '/Api/Orders');
    check('the order tier is applied to /api/orders', lower.limit === 30, `limit ${lower.limit}`);
    check(
      'a capitalised path gets the SAME tier',
      upper.limit === lower.limit && mixed.limit === lower.limit,
      `lower ${lower.limit}, upper ${upper.limit}, mixed ${mixed.limit}`
    );

    const lowerPost = await request(PORT, 'POST', '/api/orders', {}, '{}');
    const upperPost = await request(PORT, 'POST', '/API/ORDERS', {}, '{}');
    check(
      'a capitalised path gets the same STRICT write tier',
      lowerPost.limit === 5 && upperPost.limit === 5,
      `lower ${lowerPost.limit}, upper ${upperPost.limit} (the write cap is 5)`
    );

    const upperNotify = await request(PORT, 'POST', '/API/NOTIFY/OTP', {}, '{}');
    check(
      'a capitalised path gets the same mail tier',
      upperNotify.limit === 10,
      `limit ${upperNotify.limit} (the mail cap is 10)`
    );

    // --- 2. the internal-only routes must stay internal -------------------
    for (const route of ['/api/notify/otp', '/api/payments']) {
      const res = await request(PORT, 'POST', route, { 'x-notify-token': 'anything' }, '{}');
      check(
        `${route} is not reachable through the gateway`,
        res.status === 404,
        `status ${res.status} body ${String(res.body).slice(0, 80)}`
      );
    }
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
