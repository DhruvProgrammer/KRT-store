// ponytail: the auth service must not honour a client-supplied
// X-Forwarded-For from an untrusted peer. It used to set
// `app.set('trust proxy', 1)` -- "trust one hop" -- which meant the header
// was honoured from ANY peer, so a direct client could mint a fresh
// rate-limit bucket per request. Proven: 14 logins to /admin/login, each
// with a different X-Forwarded-For, and not one was limited.
//
// The fix is a LIST of trusted hops (TRUST_PROXY, default loopback), so the
// header is only read when the socket peer is one of them. This test
// simulates the deployment mistake that would expose it -- the service
// published on 0.0.0.0 -- and proves the limiter still bites.
//
//   node services/auth-service/trust-proxy.test.cjs

const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');

const AUTH_INDEX = path.join(__dirname, 'index.js');
const PORT = 3102;

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

function post(port, route, body, headers = {}, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: host,
        port,
        path: route,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', () => resolve(0));
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitFor(port, host) {
  for (let i = 0; i < 80; i++) {
    const status = await post(port, '/admin/login', { email: 'x@y.co', password: 'z' }, {}, host);
    if (status) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(async () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);

  if (!lan) {
    console.log('auth-service trust-proxy test');
    console.log('  skip (no non-loopback IPv4 on this machine -- the check needs a non-loopback peer)');
    process.exit(0);
  }

  // --- the static half: it must not be a hop count ---------------------
  const src = require('fs').readFileSync(AUTH_INDEX, 'utf8');
  check(
    "the auth service does not set 'trust proxy' to a hop count",
    !/^\s*app\.set\(\s*['"]trust proxy['"]\s*,\s*\d+\s*\)/m.test(src),
    "a hop count trusts the X-Forwarded-For header from ANY peer"
  );
  check(
    "the auth service reads its trusted hops from TRUST_PROXY",
    /TRUST_PROXY/.test(src),
    "no TRUST_PROXY in the auth service"
  );

  // --- the behavioural half: a PUBLISHED service -----------------------
  // HOST=0.0.0.0 is the deployment mistake. The peer is the machine's LAN
  // address, which is NOT loopback, so the header must be ignored.
  const child = spawn(process.execPath, [AUTH_INDEX], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '0.0.0.0',
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'http://localhost:4321',
      JWT_SECRET: 'krt-suite-secret-0123456789-abcdefghijkl',
      FRONTEND_URL: 'http://localhost:4321',
      STORE_NAME: 'KRT store',
      AUTH_DB_PATH: path.join(__dirname, 'data', 'trust-proxy-test.db')
    },
    stdio: 'ignore'
  });

  try {
    console.log('auth-service trust-proxy test');
    if (!(await waitFor(PORT, lan.address))) throw new Error('the auth service never came up');

    const codes = [];
    for (let i = 1; i <= 14; i++) {
      codes.push(
        await post(
          PORT,
          '/admin/login',
          { email: 'admin@krt.store', password: 'wrong' },
          { 'x-forwarded-for': `203.0.113.${i}` },
          lan.address
        )
      );
    }
    check(
      'a forged X-Forwarded-For from an untrusted peer does NOT mint a new bucket',
      codes.includes(429),
      `codes ${codes.join(', ')} -- every attempt got through`
    );
  } finally {
    try { child.kill(); } catch { /* already gone */ }
    try { require('fs').unlinkSync(path.join(__dirname, 'data', 'trust-proxy-test.db')); } catch { /* fine */ }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
