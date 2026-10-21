// Does TRUST_PROXY make the limiter see the real client, and can a client
// still forge its own address?
//
//   node scripts/../../services/api-gateway/trust-proxy.test.cjs
//
// Runs the gateway twice: once with TRUST_PROXY unset (the default -- the
// socket peer is the client) and once with TRUST_PROXY=loopback (a proxy in
// front). Prints the X-RateLimit-Remaining header, which is what the
// limiter actually keys on.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function get(port, headers = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/api/catalog/products', method: 'GET', headers },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      }
    );
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e) }));
    req.end();
  });
}

async function waitFor(port) {
  for (let i = 0; i < 80; i++) {
    const r = await get(port);
    if (r.status) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function startGateway(port, env) {
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
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
      ...env
    },
    stdio: 'ignore'
  });
  return child;
}

(async () => {
  let failed = 0;
  const check = (name, cond, detail = '') => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '\n       ' + detail}`);
    if (!cond) failed++;
  };

  // ---- 1. default: no trusted proxy -----------------------------------
  console.log('gateway rate limiting with TRUST_PROXY unset');
  let child = startGateway(3501, { TRUST_PROXY: '' });
  try {
    if (!(await waitFor(3501))) throw new Error('gateway did not start');
    const a = await get(3501);
    const b = await get(3501, { 'X-Forwarded-For': '9.9.9.9' });
    const remA = Number(a.headers['x-ratelimit-remaining']);
    const remB = Number(b.headers['x-ratelimit-remaining']);
    check('a request is counted', Number.isFinite(remA), `remaining ${a.headers['x-ratelimit-remaining']}`);
    check(
      'a forged X-Forwarded-For does NOT get its own bucket',
      remB === remA - 1,
      `first ${remA}, after forged XFF ${remB} (one request was made, so it must be remA-1)`
    );
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 800));
  }

  // ---- 2. TRUST_PROXY=loopback -----------------------------------------
  console.log('gateway rate limiting with TRUST_PROXY=loopback');
  child = startGateway(3502, { TRUST_PROXY: 'loopback' });
  try {
    if (!(await waitFor(3502))) throw new Error('gateway did not start');
    const a = await get(3502);
    const b = await get(3502, { 'X-Forwarded-For': '9.9.9.9' });
    const remA = Number(a.headers['x-ratelimit-remaining']);
    const remB = Number(b.headers['x-ratelimit-remaining']);
    check('a request with no X-Forwarded-For is counted', Number.isFinite(remA), `remaining ${remA}`);
    // The counters of two DIFFERENT buckets are not comparable -- what matters
    // is that the second request did not consume the first one's budget.
    const aAgain = await get(3502);
    const remAAgain = Number(aAgain.headers['x-ratelimit-remaining']);
    check(
      'a request with a DIFFERENT X-Forwarded-For gets its own bucket',
      remAAgain === remA - 1,
      `the no-XFF bucket went ${remA} -> ${remAAgain} (it should have dropped by exactly 1, not by 2); the XFF request landed on bucket remaining ${remB}`
    );
    const c = await get(3502, { 'X-Forwarded-For': '9.9.9.9' });
    const remC = Number(c.headers['x-ratelimit-remaining']);
    check(
      'the same X-Forwarded-For shares the bucket',
      remC === remB - 1,
      `first ${remB}, second ${remC}`
    );
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 800));
  }

  // ---- 3. a client that is NOT the trusted hop cannot forge its address --
  console.log('a client that is not the trusted hop cannot forge its address');
  const os = require('os');
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!lan) {
    console.log('  skip (no non-loopback IPv4 on this machine)');
  } else {
    child = startGateway(3503, { TRUST_PROXY: 'loopback' });
    try {
      if (!(await waitFor(3503))) throw new Error('gateway did not start');
      const req = (headers) =>
        new Promise((resolve) => {
          const r = http.request(
            { hostname: lan.address, port: 3503, path: '/api/catalog/products', method: 'GET', headers },
            (res) => {
              res.resume();
              res.on('end', () =>
                resolve({ status: res.statusCode, headers: res.headers })
              );
            }
          );
          r.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e) }));
          r.end();
        });
      const first = await req({});
      const second = await req({ 'X-Forwarded-For': '9.9.9.9' });
      const remFirst = Number(first.headers['x-ratelimit-remaining']);
      const remSecond = Number(second.headers['x-ratelimit-remaining']);
      check(
        'a forged X-Forwarded-For from an untrusted peer does NOT get its own bucket',
        remSecond === remFirst - 1,
        `first ${remFirst}, after forged XFF ${remSecond} (must be one shared bucket)`
      );
    } finally {
      child.kill();
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
