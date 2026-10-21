#!/usr/bin/env node
"use strict";
/**
 * Adversarial auth-security test suite for services/auth-service.
 *
 * Written against the CONTRACT (services/test/CONTRACT.md), not against the
 * current behaviour of the service. Where the contract is ambiguous the test
 * asserts the security property, not the exact wording.
 *
 * Every check prints PASS/FAIL. The process exits 1 if any check FAILed.
 *
 * ---------------------------------------------------------------------------
 * HOW IT RUNS
 * ---------------------------------------------------------------------------
 * By default the suite is SELF-CONTAINED: it starts its own mock notification
 * service and its own auth-service instances, each in a throwaway directory
 * with a throwaway SQLite database and a fresh in-memory rate-limiter state.
 *
 * That matters: an in-memory limiter is per process, so one section can never
 * exhaust the bucket of another section, and a check can never "pass" because
 * a previous check left the limiter red. Each rate-limit check gets its own
 * process, so every failure is attributable to that check alone.
 *
 * Overrides (for running against a mock someone else started):
 *   NOTIFY_URL=http://localhost:8000 use an already running mock notification
 *                                    service instead of starting one.
 *
 * The auth service is always started by this suite: an in-memory rate limiter
 * is per process, so a fresh process per section is the only way to guarantee
 * that no check inherits another check's exhausted bucket.
 *
 * Usage:  node services/test/auth-security.test.cjs
 * ---------------------------------------------------------------------------
 */

const http = require("http");
const net = require("net");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const AUTH_INDEX = path.join(ROOT, "services", "auth-service", "index.js");
const MOCK_INDEX = path.join(__dirname, "mock-notify.cjs");
const NOTIFY_SRC = path.join(ROOT, "services", "notification-service", "main.py");
const AUTHFORM_SRC = path.join(ROOT, "src", "components", "AuthForm.tsx");
const CHECKOUT_SRC = path.join(ROOT, "src", "components", "CheckoutForm.tsx");
const GATEWAY_SRC = path.join(ROOT, "services", "api-gateway", "index.js");
const COMPOSE_SRC = path.join(ROOT, "docker-compose.yml");
const AUTH_MODULES = path.join(ROOT, "services", "auth-service", "node_modules");

const Database = require(path.join(AUTH_MODULES, "better-sqlite3"));
const jwt = require(path.join(AUTH_MODULES, "jsonwebtoken"));
const { argonvaultHash } = require(path.join(ROOT, "services", "auth-service", "argonvault"));

const JWT_SECRET = process.env.TEST_JWT_SECRET || "krt-suite-secret-0123456789-abcdefghijkl";
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || "http://localhost:4321";
// ponytail: a THROWAWAY token for the mock mailer the suite starts. It used
// to be the string that was also the LIVE production NOTIFY_TOKEN -- which
// had been committed to this file (and to CONTRACT.md and mock-notify.cjs) in
// a public repository. A test secret that is also a production secret is a
// production secret.
const NOTIFY_TOKEN = "test-only-notify-token-not-a-real-secret";
const PW = "correct-horse-battery";
const OLD_SECRET = "krt-store-secret-key-dev"; // the literal C2 says must die

let NOTIFY_BASE = process.env.NOTIFY_URL || null;

/* ------------------------------------------------------------------ output */

let pass = 0;
let fail = 0;
let skipped = 0;
const failures = [];
const RESP_LOG = [];

function section(title) {
  console.log(`\n=== ${title} ===`);
}
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL  ${name}${detail ? `  <<< ${detail}` : ""}`);
  }
  return !!cond;
}
function note(msg) {
  console.log(`NOTE  ${msg}`);
}
function skip(name, reason) {
  skipped++;
  console.log(`SKIP  ${name}  <<< ${reason}`);
}

/* ------------------------------------------------------------------- http */

async function call(base, method, p, body, headers = {}, opts = {}) {
  const u = new URL(p, base);
  let data = null;
  if (body !== undefined && body !== null) {
    data = opts.raw ? String(body) : JSON.stringify(body);
  }
  const res = await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data !== null ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (response) => {
        let d = "";
        response.setEncoding("utf8");
        response.on("data", (c) => (d += c));
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, raw: d })
        );
      }
    );
    // A dead server must not crash the suite — it must look like a failed check.
    req.on("error", (e) => resolve({ status: 0, headers: {}, raw: "", error: e.message }));
    if (data !== null) req.write(data);
    req.end();
  });
  let json = null;
  try {
    json = res.raw ? JSON.parse(res.raw) : null;
  } catch {
    /* not json */
  }
  const out = { status: res.status, headers: res.headers || {}, body: json, raw: res.raw, error: res.error };
  if (opts.record) RESP_LOG.push({ method, path: p, status: out.status, raw: out.raw });
  return out;
}

function cookieOf(res, name) {
  const raw = (res.headers && res.headers["set-cookie"]) || [];
  const hit = raw.find((c) => c.startsWith(name + "="));
  return hit ? hit.split(";")[0] : null; // "name=value" — usable as a Cookie header
}
function cookieHas(res, name, attr) {
  const raw = (res.headers && res.headers["set-cookie"]) || [];
  const hit = raw.find((c) => c.startsWith(name + "="));
  if (!hit) return false;
  if (attr === "HttpOnly") return /;\s*HttpOnly/i.test(hit);
  if (attr === "Secure") return /;\s*Secure/i.test(hit);
  return new RegExp(`;\\s*${attr}=?[^;]*`, "i").test(hit);
}
function bodyHasTokens(res) {
  return /accessToken|refreshToken/.test(res.raw || "");
}

const STACK_PATTERNS = [
  /at\s+Object\.\w+/,
  /at\s+\w+\s+\([^)]*:\d+:\d+\)/,
  /node_modules[\\/]/,
  /SQLITE_\w+/,
  /\bsqlite3\b/i,
  /\bSELECT\b[\s\S]{0,300}\bFROM\b/i,
  /\.js:\d+:\d+/,
  /Error:\s+\w*Error\b/,
];
function looksLikeInternalLeak(text) {
  if (!text) return null;
  for (const p of STACK_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

// An error message that leaks the parser/binder internals instead of being
// the generic "something went wrong" the contract asks for.
const INTERNAL_MESSAGE_PATTERNS = [
  /position \d+/i,
  /line \d+ column \d+/i,
  /Too few parameter/i,
  /Too many parameter/i,
  /SQLITE/i,
  /bind/i,
  /Unexpected token/i,
  /Expected property name/i,
];
function internalMessage(text) {
  if (!text) return null;
  for (const p of INTERNAL_MESSAGE_PATTERNS) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

/** Strip // and /* *\/ comments so source-level checks do not trip on prose. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/* -------------------------------------------------------- service control */

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`port ${port} never opened`));
        else setTimeout(attempt, 120);
      });
    };
    attempt();
  });
}

const TMP_DIRS = [];

function tmpDir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(d);
  return d;
}

/**
 * Start an auth-service instance.
 * opts: { jwtSecret: string|null (null = missing), nodeEnv, notifyUrl, dir, waitForBoot }
 */
async function spawnAuth(opts = {}) {
  const port = await freePort();
  const dir = opts.dir || tmpDir("krt-auth-sec-");
  const env = Object.assign({}, process.env, {
    NODE_ENV: opts.nodeEnv || "development",
    PORT: String(port),
    ALLOWED_ORIGINS: "http://localhost:4321",
    FRONTEND_URL,
    NOTIFY_TOKEN,
    NOTIFICATION_SERVICE_URL: opts.notifyUrl || NOTIFY_BASE,
  });
  if (opts.jwtSecret === null) delete env.JWT_SECRET;
  else env.JWT_SECRET = opts.jwtSecret || JWT_SECRET;

  const child = spawn(process.execPath, [AUTH_INDEX], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  const rec = {
    child,
    port,
    dir,
    dbPath: path.join(dir, "auth.db"),
    stdout: "",
    stderr: "",
    exit: null,
    base: `http://127.0.0.1:${port}`,
  };
  child.stdout.on("data", (d) => (rec.stdout += d.toString()));
  child.stderr.on("data", (d) => (rec.stderr += d.toString()));
  child.on("exit", (code, signal) => (rec.exit = { code, signal }));

  rec.post = (p, body, headers) => call(rec.base, "POST", p, body, headers, { record: true });
  rec.get = (p, headers) => call(rec.base, "GET", p, undefined, headers, { record: true });
  rec.rawPost = (p, rawBody, headers) => call(rec.base, "POST", p, rawBody, headers, { raw: true, record: true });
  rec.db = () => openDb(rec.dbPath);
  rec.alive = () => child.exitCode === null && child.signalCode === null;
  rec.stop = () => {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  };

  if (opts.waitForBoot !== false) {
    try {
      await waitForPort(port, opts.bootTimeout || 20000);
    } catch (e) {
      rec.stop();
      throw new Error(
        `auth service did not boot on :${port} — ${e.message}\n--- stdout ---\n${rec.stdout}\n--- stderr ---\n${rec.stderr}`
      );
    }
  }
  return rec;
}

/** Start an auth-service that is expected to REFUSE TO BOOT. */
async function spawnAuthExpectExit(opts = {}) {
  const port = await freePort();
  const dir = tmpDir("krt-auth-boot-");
  const env = Object.assign({}, process.env, {
    NODE_ENV: opts.nodeEnv || "development",
    PORT: String(port),
    ALLOWED_ORIGINS: "http://localhost:4321",
    FRONTEND_URL,
    NOTIFY_TOKEN,
    NOTIFICATION_SERVICE_URL: NOTIFY_BASE,
  });
  if (opts.jwtSecret === null) delete env.JWT_SECRET;
  else env.JWT_SECRET = opts.jwtSecret;

  const child = spawn(process.execPath, [AUTH_INDEX], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d.toString()));
  child.stderr.on("data", (d) => (err += d.toString()));
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), opts.timeout || 6000);
    child.on("exit", () => {
      clearTimeout(t);
      resolve(true);
    });
  });
  let code = null;
  if (exited) code = child.exitCode;
  else {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  return { exited, code, out, err };
}

/** Run fn() against a brand new auth-service process (fresh limiter + fresh DB). */
async function withFreshService(fn, opts = {}) {
  const svc = await spawnAuth(opts);
  try {
    return await fn(svc);
  } finally {
    svc.stop();
  }
}

/* -------------------------------------------------------------- database */

function openDb(dbPath) {
  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  return db;
}
function tableColumns(db, table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch {
    return [];
  }
}
async function insertUser(db, { email, passwordHash, role = "CUSTOMER", firstName = "Tester" }) {
  const id = crypto.randomUUID();
  const have = tableColumns(db, "users");
  const fields = ["id", "email", "password"];
  const values = [id, email, passwordHash];
  if (have.includes("first_name")) {
    fields.push("first_name");
    values.push(firstName);
  }
  if (have.includes("email_verified")) {
    fields.push("email_verified");
    values.push(1);
  }
  if (have.includes("role")) {
    fields.push("role");
    values.push(role);
  }
  db.prepare(`INSERT INTO users (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`).run(...values);
  return { id, email };
}
function insertOtpRow(db, { email, purpose, hash, expiresAt, salt = null }) {
  const have = tableColumns(db, "otps");
  const build = (withSalt) => {
    const fields = ["email", "otp_hash", "purpose", "expires_at"];
    const values = [email, hash, purpose, expiresAt];
    if (withSalt && have.includes("salt")) {
      fields.push("salt");
      values.push(salt);
    }
    if (have.includes("attempts")) {
      fields.push("attempts");
      values.push(0);
    }
    db.prepare(`INSERT INTO otps (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`).run(...values);
  };
  try {
    build(true);
  } catch (e) {
    // A NOT NULL salt column would refuse the legacy row the contract wants
    // to keep working — fall back to the pre-salt shape.
    build(false);
  }
}
function insertMagicLinkRow(db, { email, tokenHash, expiresAt }) {
  const have = tableColumns(db, "magic_links");
  const fields = ["email", "token_hash", "expires_at"];
  const values = [email, tokenHash, expiresAt];
  if (have.includes("used")) {
    fields.push("used");
    values.push(0);
  }
  db.prepare(`INSERT INTO magic_links (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`).run(...values);
}

/** Shift an expiry value by deltaMs, keeping the storage format it already uses. */
function shiftExpiry(value, deltaMs) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    return String(n < 1e11 ? n + deltaMs / 1000 : n + deltaMs);
  }
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + deltaMs).toISOString();
}

/** Backdate by msBack while staying inside the SAME UTC day. */
function backdateSameUtcDay(msBack) {
  const now = new Date();
  const d = new Date(now.getTime() - msBack);
  if (d.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)) return null;
  return d.toISOString();
}

/**
 * The expiry bug is date-sensitive ('T' > ' ' makes every same-day row look
 * valid), so the backdate must not cross midnight — otherwise the test could
 * pass for the wrong reason.
 */
async function ensureBackdateWindow() {
  const now = new Date();
  const startOfDay = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (now.getTime() - startOfDay > 5 * 60 * 1000) return;
  const wait = startOfDay + 5 * 60 * 1000 - now.getTime() + 500;
  note(
    `waiting ${Math.ceil(wait / 1000)}s so a 1-hour backdate stays inside the same UTC day ` +
      `(the expiry bug only misfires for same-day rows)`
  );
  await new Promise((r) => setTimeout(r, wait));
}

/* ----------------------------------------------------------- mock helpers */

async function mockSends() {
  const r = await call(NOTIFY_BASE, "GET", "/__sent");
  return Array.isArray(r.body) ? r.body : [];
}
async function resetMock() {
  await call(NOTIFY_BASE, "GET", "/__reset");
}
async function findSend(email, { path, purpose } = {}) {
  const sends = await mockSends();
  for (let i = sends.length - 1; i >= 0; i--) {
    const e = sends[i];
    const b = e && e.body && typeof e.body === "object" ? e.body : null;
    if (!b) continue;
    if (path && e.path !== path) continue;
    if (email && String(b.email || "").trim().toLowerCase() !== String(email).trim().toLowerCase()) continue;
    if (purpose && b.purpose && b.purpose !== purpose) continue;
    return e;
  }
  return null;
}
async function extractOtp(email, purpose) {
  const e = await findSend(email, { path: "/notify/otp", purpose });
  if (!e) return null;
  const b = e.body;
  if (typeof b.otp === "string" && /^\d{6}$/.test(b.otp)) return b.otp;
  const m = JSON.stringify(b).match(/(?<![0-9])[0-9]{6}(?![0-9])/);
  return m ? m[0] : null;
}
function findLinkIn(body) {
  if (!body || typeof body !== "object") return null;
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string" && /\/magic-link\?/.test(v)) return v;
  }
  const m = JSON.stringify(body).match(/https?:\/\/[^"\\ ]*\/magic-link\?[^"\\ ]*/);
  return m ? m[0] : null;
}
async function extractMagicToken(email) {
  const e = await findSend(email, { path: "/notify/magic-link" });
  if (!e) return null;
  const b = e.body;
  if (typeof b.token === "string" && /^[0-9a-f]{64}$/i.test(b.token)) return b.token;
  const link = findLinkIn(b);
  if (link) {
    const m = link.match(/[?&]token=([0-9a-f]{64})/i);
    if (m) return m[1];
  }
  const m2 = JSON.stringify(b).match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/i);
  return m2 ? m2[0] : null;
}

/* --------------------------------------------------------------- fixtures */

function uniq(domain = "@krt.test") {
  return `t${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}${domain}`;
}
let USER_HASH = null;
async function userHash() {
  if (!USER_HASH) USER_HASH = await argonvaultHash(PW);
  return USER_HASH;
}

/* =========================================================== section: 0 */

async function sectionHarness() {
  section("0. harness / preconditions");

  const health = await call(NOTIFY_BASE, "GET", "/health");
  check("harness: the mock notification service is reachable", health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    note("cannot continue without the mock notification service");
    return false;
  }
  const cfg = await call(NOTIFY_BASE, "GET", "/__config");
  note(`mock config: ${JSON.stringify(cfg.body)}`);

  const svc = await spawnAuth();
  const me = await svc.get("/me");
  check("harness: the auth service boots and answers /me", me.status === 401, `status=${me.status}`);
  const db = svc.db();
  for (const t of ["users", "otps", "magic_links", "admin_audit_log", "refresh_tokens"]) {
    const cols = tableColumns(db, t);
    check(`harness: the ${t} table exists`, cols.length > 0, `columns=${cols.join(",")}`);
  }
  note(`otps columns: ${tableColumns(db, "otps").join(",")}`);
  note(`magic_links columns: ${tableColumns(db, "magic_links").join(",")}`);
  note(`users columns: ${tableColumns(db, "users").join(",")}`);
  svc.stop();
  return true;
}

/* =========================================================== section: 1 */

async function sectionRateLimit() {
  section("1. C4/C3 — rate limiting keyed on IP + normalised email");

  // 1.1 + 1.2 — send-otp, same address: 5 allowed, the 6th is 429 with headers.
  await withFreshService(async (svc) => {
    const email = uniq();
    const statuses = [];
    let last = null;
    for (let i = 0; i < 6; i++) {
      last = await svc.post("/send-otp", { email, purpose: "checkout" });
      statuses.push(last.status);
    }
    check(
      "C4.1 send-otp allows 5 requests for one address and blocks the 6th",
      statuses.slice(0, 5).every((s) => s !== 429) && statuses[5] === 429,
      `statuses=${statuses.join(",")}`
    );
    const h = last.headers || {};
    check(
      "C4.2 a 429 carries X-RateLimit-Limit / -Remaining / -Reset",
      statuses[5] === 429 &&
        h["x-ratelimit-limit"] !== undefined &&
        h["x-ratelimit-remaining"] !== undefined &&
        h["x-ratelimit-reset"] !== undefined,
      `status=${statuses[5]} headers=${JSON.stringify({
        limit: h["x-ratelimit-limit"],
        remaining: h["x-ratelimit-remaining"],
        reset: h["x-ratelimit-reset"],
      })}`
    );
  });

  // 1.3 — a different address must not be locked out by the first one.
  await withFreshService(async (svc) => {
    const a = uniq();
    const b = uniq();
    for (let i = 0; i < 5; i++) await svc.post("/send-otp", { email: a, purpose: "checkout" });
    const r = await svc.post("/send-otp", { email: b, purpose: "checkout" });
    check(
      "C4.3 a different address gets its own bucket (the first address does not lock it out)",
      r.status !== 429,
      `status=${r.status} ${(r.raw || "").slice(0, 140)}`
    );
  });

  // 1.4 — verify-otp had no limiter at all.
  await withFreshService(async (svc) => {
    const email = uniq();
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const r = await svc.post("/verify-otp", { email, otp: String(200000 + i), purpose: "checkout" });
      statuses.push(r.status);
    }
    check(
      "C4.4 verify-otp is throttled (max 10/60s: the 11th attempt is 429)",
      statuses.slice(0, 10).every((s) => s !== 429) && statuses[10] === 429,
      `statuses=${statuses.join(",")}`
    );
  });

  // 1.5 — register had no limiter at all.
  await withFreshService(async (svc) => {
    const email = uniq();
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const r = await svc.post("/register", {
        email,
        password: "attacker-chosen-pw",
        first_name: "A",
        otp: String(300000 + i),
      });
      statuses.push(r.status);
    }
    check(
      "C4.5 register is throttled (max 10/60s: the 11th attempt is 429)",
      statuses.slice(0, 10).every((s) => s !== 429) && statuses[10] === 429,
      `statuses=${statuses.join(",")}`
    );
  });

  // 1.6 — login-otp.
  await withFreshService(async (svc) => {
    const email = uniq();
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const r = await svc.post("/login-otp", { email, otp: String(400000 + i) });
      statuses.push(r.status);
    }
    check(
      "C4.6 login-otp is throttled (max 10/60s: the 11th attempt is 429)",
      statuses.slice(0, 10).every((s) => s !== 429) && statuses[10] === 429,
      `statuses=${statuses.join(",")}`
    );
  });

  // 1.7 — login.
  await withFreshService(async (svc) => {
    const email = uniq();
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const r = await svc.post("/login", { email, password: "wrong-password" });
      statuses.push(r.status);
    }
    check(
      "C4.7 login is throttled (max 10/60s: the 11th attempt is 429)",
      statuses.slice(0, 10).every((s) => s !== 429) && statuses[10] === 429,
      `statuses=${statuses.join(",")}`
    );
  });

  // 1.8 — send-magic-link.
  await withFreshService(async (svc) => {
    const email = uniq();
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = await svc.post("/send-magic-link", { email });
      statuses.push(r.status);
    }
    check(
      "C4.8 send-magic-link is throttled (max 5/60s: the 6th request is 429)",
      statuses.slice(0, 5).every((s) => s !== 429) && statuses[5] === 429,
      `statuses=${statuses.join(",")}`
    );
  });

  // 1.9 — admin/login.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const admin = uniq();
    await insertUser(db, { email: admin, passwordHash: await userHash(), role: "ADMIN" });
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = await svc.post("/admin/login", { email: admin, password: "wrong-password" });
      statuses.push(r.status);
    }
    check(
      "C4.9 admin/login is throttled (max 5/60s: the 6th attempt is 429)",
      statuses.slice(0, 5).every((s) => s !== 429) && statuses[5] === 429,
      `statuses=${statuses.join(",")}`
    );
    db.close();
  });

  // 1.10 — the key normalises the email: case and whitespace variants share a
  //        bucket, a genuinely different address does not.  Both halves are in
  //        one check so it cannot pass vacuously (IP-only keying would make
  //        the first half true for the wrong reason).
  await withFreshService(async (svc) => {
    const base = uniq();
    const upper = base.toUpperCase();
    const padded = `  ${base}  `;
    const other = uniq();
    const statuses = [];
    for (let i = 0; i < 5; i++) await svc.post("/send-otp", { email: base, purpose: "checkout" });
    const s6 = await svc.post("/send-otp", { email: base, purpose: "checkout" });
    const sUpper = await svc.post("/send-otp", { email: upper, purpose: "checkout" });
    const sPadded = await svc.post("/send-otp", { email: padded, purpose: "checkout" });
    const sOther = await svc.post("/send-otp", { email: other, purpose: "checkout" });
    statuses.push(s6.status, sUpper.status, sPadded.status, sOther.status);
    check(
      "C4.10 the limiter key normalises the email (case/whitespace variants share the bucket, a different address does not)",
      s6.status === 429 && sUpper.status === 429 && sPadded.status === 429 && sOther.status !== 429,
      `base=${s6.status} upper=${sUpper.status} padded=${sPadded.status} other=${sOther.status}`
    );
  });

  // 1.11 — C3 trust proxy: the audit log must record the forwarded client IP.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const admin = uniq();
    await insertUser(db, { email: admin, passwordHash: await userHash(), role: "ADMIN" });
    await svc.post("/admin/login", { email: admin, password: "wrong" }, { "x-forwarded-for": "203.0.113.77" });
    const row = db.prepare("SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT 1").get();
    check(
      "C3.1 the audit log records the forwarded client IP (app.set('trust proxy', 1))",
      !!row && String(row.ip) === "203.0.113.77",
      `ip=${row ? row.ip : null} (a raw socket address means trust proxy is NOT set)`
    );
    db.close();
  });

  // 1.12 — C3 + C4: a second client behind the proxy is not locked out for
  //        a DIFFERENT address (the IP half of the key still works), and the
  //        SAME address stays capped per recipient even when the client IP
  //        changes (the OTP-invalidation DoS protection).
  await withFreshService(async (svc) => {
    const email = uniq();
    const otherEmail = uniq();
    const h1 = { "x-forwarded-for": "198.51.100.10" };
    const h2 = { "x-forwarded-for": "198.51.100.11" };
    for (let i = 0; i < 5; i++) await svc.post("/send-otp", { email, purpose: "checkout" }, h1);
    const same = await svc.post("/send-otp", { email, purpose: "checkout" }, h1);
    const otherAddr = await svc.post("/send-otp", { email: otherEmail, purpose: "checkout" }, h2);
    check(
      "C3.2 the limiter keys on the forwarded client IP (a second client is not locked out)",
      same.status === 429 && otherAddr.status !== 429,
      `same-client=${same.status} other-client-other-address=${otherAddr.status}`
    );
    const sameAddrOtherClient = await svc.post("/send-otp", { email, purpose: "checkout" }, h2);
    check(
      "C9.1 the same address stays capped per RECIPIENT even when the client IP changes (no OTP-invalidation DoS)",
      sameAddrOtherClient.status === 429,
      `status=${sameAddrOtherClient.status} (a distributed caller must not be able to keep invalidating one recipient's code)`
    );
  });
}

/* =========================================================== section: 2 */

async function sectionOtpAttempts() {
  section("2. C5 — OTP attempt counter (the code must be destroyed, not throttled)");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    await resetMock();
    const send = await svc.post("/send-otp", { email, purpose: "login" });
    const otp = await extractOtp(email, "login");
    if (!check("C5.0 precondition: a login OTP was issued for the test user", !!otp, `send-otp=${send.status} ${(send.raw || "").slice(0, 140)}`)) {
      db.close();
      return;
    }
    const row0 = db.prepare("SELECT * FROM otps WHERE email = ? AND purpose = 'login' ORDER BY id DESC LIMIT 1").get(email);
    if (!check("C5.0b precondition: an otps row exists", !!row0, JSON.stringify(row0))) {
      db.close();
      return;
    }
    const hasAttempts = tableColumns(db, "otps").includes("attempts");
    const wrong = ["000001", "000002", "000003", "000004", "000005"].filter((c) => c !== otp);
    const seen = [];
    for (const code of wrong) {
      await svc.post("/login-otp", { email, otp: code });
      const r = db.prepare("SELECT * FROM otps WHERE id = ?").get(row0.id);
      seen.push(r ? (r.attempts === undefined ? "no-attempts-column" : r.attempts) : null);
    }
    // The counter must reach 5; at that point the row is destroyed, so the
    // fifth observation may legitimately be "row gone".
    const counterOk =
      hasAttempts &&
      seen.length === 5 &&
      seen.slice(0, 4).every((v, i) => v === i + 1) &&
      (seen[4] === 5 || seen[4] === null);
    check(
      "C5.1 every failed verification increments the attempts counter",
      counterOk,
      `attempts observed=${JSON.stringify(seen)} (column present=${hasAttempts})`
    );
    const alive = db.prepare("SELECT COUNT(*) c FROM otps WHERE id = ?").get(row0.id).c;
    const afterFive = db.prepare("SELECT * FROM otps WHERE id = ?").get(row0.id);
    const counterAtFive = afterFive ? afterFive.attempts : null;
    check(
      "C5.2 the OTP row is destroyed once the attempt counter reaches 5",
      alive === 0 || (hasAttempts && counterAtFive >= 5),
      `rows left for that OTP=${alive} attempts=${counterAtFive === undefined ? "no-attempts-column" : counterAtFive}`
    );
    const sixth = await svc.post("/login-otp", { email, otp: "000009" });
    const stillThere = db.prepare("SELECT COUNT(*) c FROM otps WHERE id = ?").get(row0.id).c;
    check(
      "C5.3 the 6th attempt is rejected as a destroyed code (4xx, not a 429 rate-limit) and the code stays destroyed",
      sixth.status >= 400 && sixth.status < 500 && stillThere === 0,
      `status=${sixth.status} rows left after the 6th attempt=${stillThere} (the login-otp limiter allows 10/60s, so a 429 here would be the limiter, not the counter)`
    );
    db.close();
  });
}

async function sectionOtpLifecycle() {
  section("3. C5 — OTP lifecycle (success still works, a new code invalidates the old one)");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    await resetMock();
    await svc.post("/send-otp", { email, purpose: "login" });
    const otp = await extractOtp(email, "login");
    if (!check("C5.4 precondition: a login OTP was issued", !!otp)) {
      db.close();
      return;
    }
    const ok = await svc.post("/login-otp", { email, otp });
    check("C5.4 a successful verification still works", ok.status === 200, `status=${ok.status} ${(ok.raw || "").slice(0, 140)}`);
    const left = db.prepare("SELECT COUNT(*) c FROM otps WHERE email = ? AND purpose = 'login'").get(email).c;
    check("C5.5 a successful verification deletes the OTP row", left === 0, `rows left=${left}`);
    db.close();
  });

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    await resetMock();
    await svc.post("/send-otp", { email, purpose: "login" });
    const otp1 = await extractOtp(email, "login");
    await svc.post("/send-otp", { email, purpose: "login" });
    const otp2 = await extractOtp(email, "login");
    if (!check("C5.6 precondition: two different OTPs were issued", !!otp1 && !!otp2 && otp1 !== otp2, `otp1=${otp1} otp2=${otp2}`)) {
      db.close();
      return;
    }
    const oldTry = await svc.post("/login-otp", { email, otp: otp1 });
    check(
      "C5.7 issuing a new OTP invalidates the previous one (the old code is refused)",
      oldTry.status >= 400 && oldTry.status < 500,
      `status=${oldTry.status} ${(oldTry.raw || "").slice(0, 140)}`
    );
    const newTry = await svc.post("/login-otp", { email, otp: otp2 });
    check("C5.8 the newest code still verifies", newTry.status === 200, `status=${newTry.status} ${(newTry.raw || "").slice(0, 140)}`);
    db.close();
  });
}

/* =========================================================== section: 4 */

async function sectionEnumeration() {
  section("4. C7 — no account enumeration");

  for (const purpose of ["registration", "login", "checkout"]) {
    await withFreshService(async (svc) => {
      const db = svc.db();
      const known = uniq();
      await insertUser(db, { email: known, passwordHash: await userHash() });
      const unknown = uniq();
      const a = await svc.post("/send-otp", { email: known, purpose });
      const b = await svc.post("/send-otp", { email: unknown, purpose });
      const same =
        a.status === b.status && JSON.stringify(a.body) === JSON.stringify(b.body);
      check(
        `C7.1 send-otp(${purpose}) is identical for a known and an unknown address`,
        same && a.status === 200,
        `known=${a.status} ${JSON.stringify(a.body)} | unknown=${b.status} ${JSON.stringify(b.body)}`
      );
      db.close();
    });
  }

  await withFreshService(async (svc) => {
    const db = svc.db();
    const known = uniq();
    await insertUser(db, { email: known, passwordHash: await userHash() });
    const unknown = uniq();
    const noAccount = await svc.post("/login-otp", { email: unknown, otp: "123456" });
    const wrongCode = await svc.post("/login-otp", { email: known, otp: "000000" });
    check(
      "C7.2 login-otp returns an identical body for an unknown account and for a wrong code",
      noAccount.status === wrongCode.status &&
        noAccount.status === 400 &&
        JSON.stringify(noAccount.body) === JSON.stringify(wrongCode.body),
      `unknown=${noAccount.status} ${JSON.stringify(noAccount.body)} | wrong=${wrongCode.status} ${JSON.stringify(wrongCode.body)}`
    );
    db.close();
  });

  await withFreshService(async (svc) => {
    const unknown = uniq();
    const noAccount = await svc.post("/login", { email: unknown, password: "whatever-123" });
    const db = svc.db();
    const known = uniq();
    await insertUser(db, { email: known, passwordHash: await userHash() });
    const wrongPw = await svc.post("/login", { email: known, password: "not-the-password" });
    check(
      "C7.3 login returns an identical body for an unknown address and for a wrong password",
      noAccount.status === wrongPw.status &&
        noAccount.status === 401 &&
        JSON.stringify(noAccount.body) === JSON.stringify(wrongPw.body),
      `unknown=${noAccount.status} ${JSON.stringify(noAccount.body)} | wrong=${wrongPw.status} ${JSON.stringify(wrongPw.body)}`
    );
    db.close();
  });

  await withFreshService(async (svc) => {
    const db = svc.db();
    const known = uniq();
    await insertUser(db, { email: known, passwordHash: await userHash() });
    const sendRes = await svc.post("/send-otp", { email: known, purpose: "registration" });
    const otp = await extractOtp(known, "registration");
    // With a valid OTP the duplicate MUST be answered with 409.  Without one
    // (the service may decline to issue a registration OTP for an address
    // that already exists) any 4xx is acceptable — the point of the check is
    // that no second account is ever created.
    const exact409 = !!otp;
    const reg = await svc.post("/register", {
      email: known,
      password: "another-password-1",
      first_name: "A",
      otp: otp || "000000",
    });
    const rows = db.prepare("SELECT COUNT(*) c FROM users WHERE lower(email) = ?").get(known).c;
    const statusOk = exact409 ? reg.status === 409 : reg.status >= 400 && reg.status < 500;
    check(
      "C7.4 register refuses a duplicate account and creates no second row",
      statusOk && rows === 1,
      `status=${reg.status} rows=${rows} send-otp=${sendRes.status} (a valid registration OTP was ${exact409 ? "available" : "not issued"})`
    );
    db.close();
  });
}

/* =========================================================== section: 5 */

async function sectionPurpose() {
  section("5. C8 — purpose allowlist and HTML injection");

  await withFreshService(async (svc) => {
    await resetMock();
    const evil = '<a href="https://evil.tld">click</a>';
    const r = await svc.post("/send-otp", { email: uniq(), purpose: evil });
    check(
      "C8.1 a purpose containing HTML is rejected",
      r.status >= 400 && r.status < 500,
      `status=${r.status} ${(r.raw || "").slice(0, 140)}`
    );
    const sends = await mockSends();
    check(
      "C8.2 no email is sent for a rejected purpose",
      sends.length === 0,
      `recorded=${sends.length} paths=${sends.map((s) => s.path).join(",")}`
    );
    check(
      "C8.3 the injected markup never reaches the notification service",
      !JSON.stringify(sends).includes("evil.tld"),
      `recorded=${JSON.stringify(sends).slice(0, 200)}`
    );

    const r2 = await svc.post("/send-otp", { email: uniq(), purpose: "admin-override" });
    check(
      "C8.4 a purpose outside the allowlist is rejected",
      r2.status >= 400 && r2.status < 500,
      `status=${r2.status} ${(r2.raw || "").slice(0, 140)}`
    );
    const sends2 = await mockSends();
    check(
      "C8.5 still no email is sent for the rejected purpose",
      sends2.length === 0,
      `recorded=${sends2.length} paths=${sends2.map((s) => s.path).join(",")}`
    );
  });

  // The allowlisted purposes must still work.  Each purpose is exercised with
  // an address that suits it (registration/checkout -> a fresh address, login
  // -> an existing account) so that this check fails ONLY because the
  // allowlist rejected a legitimate purpose.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const existing = uniq();
    await insertUser(db, { email: existing, passwordHash: await userHash() });
    const cases = [
      ["registration", uniq()],
      ["login", existing],
      ["checkout", uniq()],
    ];
    for (const [purpose, email] of cases) {
      const r = await svc.post("/send-otp", { email, purpose });
      check(
        `C8.6 the allowlisted purpose "${purpose}" is accepted`,
        r.status === 200,
        `status=${r.status} ${(r.raw || "").slice(0, 140)}`
      );
    }
    db.close();
  });
}

/* =========================================================== section: 6 */

async function sectionMagicLink() {
  section("6. C9 — magic link end to end");

  const notifSrc = fs.readFileSync(NOTIFY_SRC, "utf8");
  check(
    "C9.1 the notification service exposes POST /notify/magic-link",
    /@app\.post\(\s*["']\/notify\/magic-link["']\s*\)/.test(notifSrc),
    "no /notify/magic-link route in services/notification-service/main.py"
  );

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    await resetMock();
    const send = await svc.post("/send-magic-link", { email });
    check("C9.2 send-magic-link answers 200", send.status === 200, `status=${send.status} ${(send.raw || "").slice(0, 160)}`);
    const sends = await mockSends();
    const ml = sends.find((s) => s.path === "/notify/magic-link");
    check(
      "C9.3 the notification service received POST /notify/magic-link",
      !!ml,
      `paths=${sends.map((s) => s.path).join(",") || "(none)"}`
    );
    check(
      "C9.4 the notification service accepted the magic-link payload (2xx)",
      !!ml && ml.status >= 200 && ml.status < 300,
      `status=${ml ? ml.status : "n/a"} body=${JSON.stringify(ml ? ml.body : null).slice(0, 220)}`
    );
    const link = ml ? findLinkIn(ml.body) : null;
    check(
      `C9.5 the magic link URL is ${FRONTEND_URL}/magic-link?token=<64 hex>&email=<url-encoded>`,
      !!link &&
        link.startsWith(`${FRONTEND_URL}/magic-link?`) &&
        /[?&]token=[0-9a-f]{64}(&|$)/i.test(link) &&
        /[?&]email=/.test(link),
      `link=${link}`
    );
    const token = await extractMagicToken(email);
    check("C9.6 the magic link token is 64 hex characters", !!token, `token=${token}`);
    db.close();
  });

  // Expiry + single use + concurrency.  One process, four links (the
  // send-magic-link limiter allows 5/60s).
  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    await ensureBackdateWindow();

    // --- link A: fresh -> accepted (this is the control that stops the
    //     expiry test from passing by rejecting everything.
    await resetMock();
    await svc.post("/send-magic-link", { email });
    const tokenA = await extractMagicToken(email);
    let rowA = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    if (!rowA && tokenA) {
      // The end-to-end flow is broken (no row).  Seed one so the expiry
      // semantics can still be exercised; the control below tells us whether
      // that seeded row is verifiable at all.
      insertMagicLinkRow(db, { email, tokenHash: legacyMagicHash(tokenA), expiresAt: futureIso() });
      rowA = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
      note("the magic-link flow created no row — seeded one directly to test the expiry semantics");
    }
    if (!check("C9.7 precondition: a magic_links row exists for the test user", !!rowA, JSON.stringify(rowA))) {
      db.close();
      return;
    }
    if (!check("C9.7b precondition: the plaintext token is known", !!tokenA, `token=${tokenA}`)) {
      db.close();
      return;
    }

    const okRes = await svc.post("/verify-magic-link", { email, token: tokenA });
    const controlOk = okRes.status === 200;
    check(
      "C9.8 a fresh (still valid) magic link is accepted — the control for the expiry test",
      controlOk,
      `status=${okRes.status} ${(okRes.raw || "").slice(0, 160)}`
    );
    if (!controlOk) {
      note("the control failed — the expiry result below is NOT conclusive");
    }
    const used = db.prepare("SELECT * FROM magic_links WHERE id = ?").get(rowA.id);
    check(
      "C9.9 a verified magic link is marked used",
      used && Number(used.used) === 1,
      `used=${used ? used.used : "no row"}`
    );
    const again = await svc.post("/verify-magic-link", { email, token: tokenA });
    check(
      "C9.10 a magic link is single-use (the second verification fails)",
      again.status >= 400 && again.status < 500,
      `status=${again.status} ${(again.raw || "").slice(0, 140)}`
    );

    // --- link B: backdated by one hour, same UTC day.
    await resetMock();
    await svc.post("/send-magic-link", { email });
    const tokenB = await extractMagicToken(email);
    let rowB = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    if (!rowB && tokenB) {
      insertMagicLinkRow(db, { email, tokenHash: legacyMagicHash(tokenB), expiresAt: futureIso() });
      rowB = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    }
    if (!check("C9.11 precondition: a second magic_links row exists", !!rowB, JSON.stringify(rowB))) {
      db.close();
      return;
    }
    const sameDay = backdateSameUtcDay(60 * 60 * 1000);
    const shifted = shiftExpiry(rowB.expires_at, -60 * 60 * 1000);
    check(
      "C9.11b precondition: the expiry can be backdated inside the same UTC day",
      !!sameDay && !!shifted,
      `expires_at=${rowB.expires_at} same-day-backdate=${sameDay} shifted=${shifted}`
    );
    if (shifted) {
      db.prepare("UPDATE magic_links SET expires_at = ? WHERE id = ?").run(shifted, rowB.id);
      const expired = await svc.post("/verify-magic-link", { email, token: tokenB });
      check(
        "C9.12 a magic link older than its TTL is rejected",
        controlOk && expired.status >= 400 && expired.status < 500,
        `status=${expired.status} ${(expired.raw || "").slice(0, 160)} (backdated to ${shifted}; a same-day ISO expiry that still verifies is the 'T' > ' ' comparison bug)`
      );
      if (!controlOk) {
        note("C9.12 is NOT conclusive — the fresh-link control (C9.8) failed");
      }
    }

    // --- link C: backdated by two days (different UTC date).
    await resetMock();
    await svc.post("/send-magic-link", { email });
    const tokenC = await extractMagicToken(email);
    let rowC = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    if (!rowC && tokenC) {
      insertMagicLinkRow(db, { email, tokenHash: legacyMagicHash(tokenC), expiresAt: futureIso() });
      rowC = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    }
    if (rowC) {
      const shiftedC = shiftExpiry(rowC.expires_at, -48 * 60 * 60 * 1000);
      db.prepare("UPDATE magic_links SET expires_at = ? WHERE id = ?").run(shiftedC, rowC.id);
      const expiredC = await svc.post("/verify-magic-link", { email, token: tokenC });
      check(
        "C9.13 a magic link from a previous day is rejected",
        controlOk && expiredC.status >= 400 && expiredC.status < 500,
        `status=${expiredC.status} expires_at=${shiftedC}`
      );
    }

    // --- link D: two concurrent verifications.
    await resetMock();
    await svc.post("/send-magic-link", { email });
    const tokenD = await extractMagicToken(email);
    let rowD = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    if (!rowD && tokenD) {
      insertMagicLinkRow(db, { email, tokenHash: legacyMagicHash(tokenD), expiresAt: futureIso() });
      rowD = db.prepare("SELECT * FROM magic_links WHERE email = ? ORDER BY id DESC LIMIT 1").get(email);
    }
    if (rowD && tokenD) {
      const [r1, r2] = await Promise.all([
        svc.post("/verify-magic-link", { email, token: tokenD }),
        svc.post("/verify-magic-link", { email, token: tokenD }),
      ]);
      const ok = [r1, r2].filter((r) => r.status === 200).length;
      check(
        "C9.14 two concurrent verifications of one token yield exactly one session",
        ok === 1,
        `statuses=${r1.status},${r2.status} (sessions=${ok})`
      );
    } else {
      skip("C9.14 two concurrent verifications of one token yield exactly one session", "no magic link available");
    }
    db.close();
  });

  // A failed send must delete only the row that failed.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    const other = futureIso();
    insertMagicLinkRow(db, { email, tokenHash: legacyMagicHash("b".repeat(64)), expiresAt: other });
    const before = db.prepare("SELECT COUNT(*) c FROM magic_links WHERE email = ?").get(email).c;
    await svc.post("/send-magic-link", { email });
    const after = db.prepare("SELECT COUNT(*) c FROM magic_links WHERE email = ?").get(email).c;
    check(
      "C9.15 a failed magic-link send deletes only the failing row, not every row for that address",
      after >= before,
      `rows before=${before} rows after=${after} (the pre-existing, still-valid link must survive)`
    );
    db.close();
  }, { notifyUrl: "http://127.0.0.1:1" }); // a dead mailer -> the send fails
}

function legacyMagicHash(token) {
  return crypto.createHash("sha256").update(token + "krt-magic-salt").digest("hex");
}
function futureIso() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}
/** The last 6-digit number on a log line that mentions an OTP. */
function otpFromLog(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!/otp/i.test(lines[i])) continue;
    const m = lines[i].match(/\b\d{6}\b/g);
    if (m && m.length) return m[m.length - 1];
  }
  return null;
}

/* =========================================================== section: 7 */

async function sectionTokenTransport() {
  section("7. C1 — token transport (cookies only, never in the body)");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const results = {};

    const u1 = uniq();
    await insertUser(db, { email: u1, passwordHash: await userHash() });
    results["/login"] = await svc.post("/login", { email: u1, password: PW });

    const u2 = uniq();
    await insertUser(db, { email: u2, passwordHash: await userHash() });
    await svc.post("/send-otp", { email: u2, purpose: "login" });
    const otp2 = await extractOtp(u2, "login");
    results["/login-otp"] = otp2
      ? await svc.post("/login-otp", { email: u2, otp: otp2 })
      : { status: 0, raw: "no OTP was issued", headers: {}, body: null };

    const u3 = uniq();
    await svc.post("/send-otp", { email: u3, purpose: "registration" });
    const otp3 = await extractOtp(u3, "registration");
    results["/register"] = otp3
      ? await svc.post("/register", { email: u3, password: PW, first_name: "T", otp: otp3 })
      : { status: 0, raw: "no OTP was issued", headers: {}, body: null };

    const u4 = uniq();
    await insertUser(db, { email: u4, passwordHash: await userHash() });
    await svc.post("/send-magic-link", { email: u4 });
    const tok4 = await extractMagicToken(u4);
    results["/verify-magic-link"] = tok4
      ? await svc.post("/verify-magic-link", { email: u4, token: tok4 })
      : { status: 0, raw: "no magic link was issued", headers: {}, body: null };

    const admin = uniq();
    await insertUser(db, { email: admin, passwordHash: await userHash(), role: "ADMIN" });
    results["/admin/login"] = await svc.post("/admin/login", { email: admin, password: PW });

    for (const [name, res] of Object.entries(results)) {
      check(
        `C1.1 ${name} succeeds and returns no accessToken/refreshToken in the body`,
        res.status >= 200 && res.status < 300 && !bodyHasTokens(res),
        `status=${res.status} body=${(res.raw || "").slice(0, 180)}`
      );
      check(
        `C1.2 ${name} sets HttpOnly + SameSite=Strict auth cookies`,
        cookieHas(res, "krt_access", "HttpOnly") &&
          cookieHas(res, "krt_refresh", "HttpOnly") &&
          cookieHas(res, "krt_access", "SameSite=Strict") &&
          cookieHas(res, "krt_refresh", "SameSite=Strict"),
        `cookies=${JSON.stringify(res.headers["set-cookie"])}`
      );
    }
    db.close();
  });

  // Secure must be set in production.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    const res = await svc.post("/login", { email, password: PW });
    check(
      "C1.3 the auth cookie carries Secure when NODE_ENV=production",
      res.status === 200 && cookieHas(res, "krt_access", "Secure") && cookieHas(res, "krt_refresh", "Secure"),
      `cookies=${JSON.stringify(res.headers["set-cookie"])}`
    );
    db.close();
  }, { nodeEnv: "production" });
}

/* =========================================================== section: 8 */

async function sectionSecret() {
  section("8. C2 — JWT_SECRET is required (no fallback)");

  for (const [label, secret] of [
    ["missing", null],
    ["shorter than 32 bytes", "too-short-secret"],
  ]) {
    const r = await spawnAuthExpectExit({ jwtSecret: secret });
    check(
      `C2.1 the service exits non-zero when JWT_SECRET is ${label}`,
      r.exited && r.code !== 0,
      r.exited ? `exit code=${r.code}` : "the process kept running — it booted without a usable secret"
    );
    check(
      `C2.2 the boot failure names JWT_SECRET (${label})`,
      /JWT_SECRET/.test(r.out + r.err),
      `output tail: ${JSON.stringify((r.out + r.err).slice(-300))}`
    );
  }

  await withFreshService(async (svc) => {
    const forged = jwt.sign({ userId: crypto.randomUUID(), email: uniq(), role: "ADMIN" }, OLD_SECRET, { expiresIn: "1h" });
    const me = await svc.get("/me", { Authorization: `Bearer ${forged}` });
    check(
      "C2.3 a token signed with the old default secret is rejected by /me",
      me.status === 401,
      `status=${me.status} ${(me.raw || "").slice(0, 140)}`
    );
    const av = await svc.get("/admin/verify", { Authorization: `Bearer ${forged}` });
    check(
      "C2.4 a token signed with the old default secret is rejected by /admin/verify",
      av.status === 401,
      `status=${av.status} ${(av.raw || "").slice(0, 140)}`
    );
  });
}

/* =========================================================== section: 9 */

async function sectionMeIdentity() {
  section("9. C15 — /me identity comes from the signed subject");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    const { id } = await insertUser(db, { email, passwordHash: await userHash() });
    const token = jwt.sign({ userId: id, email: "not-the-user@nowhere.test", role: "CUSTOMER" }, JWT_SECRET, { expiresIn: "1h" });
    const res = await svc.get("/me", { Authorization: `Bearer ${token}` });
    check(
      "C15.1 /me resolves the user by the signed userId, not by the email claim",
      res.status === 200 && res.body && res.body.id === id && res.body.email === email,
      `status=${res.status} body=${(res.raw || "").slice(0, 180)}`
    );
    const ghost = jwt.sign({ userId: crypto.randomUUID(), email, role: "CUSTOMER" }, JWT_SECRET, { expiresIn: "1h" });
    const res2 = await svc.get("/me", { Authorization: `Bearer ${ghost}` });
    check(
      "C15.2 /me answers 404 (not 500) for a valid token with an unknown userId",
      res2.status === 404,
      `status=${res2.status} ${(res2.raw || "").slice(0, 140)}`
    );
    db.close();
  });
}

/* ========================================================== section: 10 */

async function sectionNormalisation() {
  section("10. C13 — email normalisation (trim + lowercase everywhere)");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const base = uniq();
    const [local, domain] = base.split("@");
    const mixed = `${local.toUpperCase()}@${domain.toUpperCase()}`;

    await svc.post("/send-otp", { email: mixed, purpose: "registration" });
    const otp = await extractOtp(mixed, "registration");
    const reg = otp
      ? await svc.post("/register", { email: mixed, password: PW, first_name: "T", otp })
      : { status: 0, raw: "no OTP was issued", body: null };
    check(
      "C13.1 an address that differs only in case registers",
      reg.status === 200 || reg.status === 201,
      `status=${reg.status} ${(reg.raw || "").slice(0, 160)}`
    );

    const rows = db.prepare("SELECT id, email FROM users WHERE lower(email) = ?").all(base);
    check("C13.2 the database holds exactly ONE row for the address", rows.length === 1, `rows=${JSON.stringify(rows)}`);
    check(
      "C13.3 the stored address is lowercase and trimmed",
      rows.length === 1 && rows[0].email === base,
      `stored=${rows.map((r) => r.email).join(",")} expected=${base}`
    );

    const lowerLogin = await svc.post("/login", { email: base, password: PW });
    check(
      "C13.4 the lowercase form signs in to the same account",
      lowerLogin.status === 200,
      `status=${lowerLogin.status} ${(lowerLogin.raw || "").slice(0, 160)}`
    );

    const padded = `  ${base}  `;
    const sendPadded = await svc.post("/send-otp", { email: padded, purpose: "login" });
    check(
      "C13.5 a padded address is accepted, not rejected as malformed",
      sendPadded.status === 200,
      `status=${sendPadded.status} ${(sendPadded.raw || "").slice(0, 160)}`
    );
    const paddedLogin = await svc.post("/login", { email: padded, password: PW });
    check(
      "C13.6 the padded form signs in to the same account",
      paddedLogin.status === 200,
      `status=${paddedLogin.status} ${(paddedLogin.raw || "").slice(0, 160)}`
    );
    db.close();
  });
}

/* ========================================================== section: 11 */

async function sectionAdmin() {
  section("11. C7/C2 — admin login and the audit log");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const admin = uniq();
    await insertUser(db, { email: admin, passwordHash: await userHash(), role: "ADMIN" });
    const plain = uniq();
    await insertUser(db, { email: plain, passwordHash: await userHash() });

    const before = db.prepare("SELECT COUNT(*) c FROM admin_audit_log").get().c;
    const refused = await svc.post("/admin/login", { email: plain, password: PW });
    check(
      "C7.5 a non-admin account cannot log in at /admin/login",
      refused.status === 401,
      `status=${refused.status} ${(refused.raw || "").slice(0, 140)}`
    );
    check(
      "C7.6 the refused admin login returns no tokens and sets no cookie",
      !bodyHasTokens(refused) && !(refused.headers["set-cookie"] || []).length,
      `body=${(refused.raw || "").slice(0, 140)} cookies=${JSON.stringify(refused.headers["set-cookie"])}`
    );
    const afterFail = db.prepare("SELECT COUNT(*) c FROM admin_audit_log").get().c;
    check(
      "C2.5 a failed admin login is written to admin_audit_log",
      afterFail > before,
      `rows before=${before} after=${afterFail} service stderr: ${svc.stderr.trim().slice(-200)}`
    );
    const failRow = db.prepare("SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT 1").get();
    check(
      "C2.6 the audit row identifies the attempted admin",
      !!failRow && String(failRow.admin_email || "").toLowerCase() === plain.toLowerCase(),
      JSON.stringify(failRow)
    );

    const okAdmin = await svc.post("/admin/login", { email: admin, password: PW });
    check("C2.7 a successful admin login works", okAdmin.status === 200, `status=${okAdmin.status} ${(okAdmin.raw || "").slice(0, 140)}`);
    const okRow = db.prepare("SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT 1").get();
    check(
      "C2.8 a successful admin login is written to admin_audit_log",
      !!okRow && /ok/i.test(String(okRow.action || "")),
      JSON.stringify(okRow)
    );

    const noToken = await svc.get("/admin/audit");
    check("C2.9 /admin/audit requires a token", noToken.status === 401, `status=${noToken.status}`);

    const userLogin = await svc.post("/login", { email: plain, password: PW });
    const userCookie = cookieOf(userLogin, "krt_access");
    const asUser = await svc.get("/admin/audit", userCookie ? { Cookie: userCookie } : {});
    check(
      "C2.10 /admin/audit rejects a non-admin token",
      asUser.status === 403,
      `status=${asUser.status} ${(asUser.raw || "").slice(0, 140)}`
    );

    const adminCookie = cookieOf(okAdmin, "krt_access");
    const asAdmin = await svc.get("/admin/audit", adminCookie ? { Cookie: adminCookie } : {});
    check(
      "C2.11 /admin/audit works for an admin",
      asAdmin.status === 200 && Array.isArray(asAdmin.body && asAdmin.body.rows),
      `status=${asAdmin.status} ${(asAdmin.raw || "").slice(0, 140)}`
    );
    db.close();
  });
}

/* ========================================================== section: 12 */

async function sectionErrors() {
  section("12. C14 — error handling (no 500s, no stack traces, no SQL)");

  await withFreshService(async (svc) => {
    const db = svc.db();
    // A real account, so the password verifier is actually reached.
    const known = uniq();
    await insertUser(db, { email: known, passwordHash: await userHash() });

    const bad = await svc.rawPost("/login", "{not json");
    check(
      "C14.1 malformed JSON is a 4xx, not a 500",
      bad.status >= 400 && bad.status < 500,
      `status=${bad.status} ${(bad.raw || "").slice(0, 180)}`
    );
    check(
      "C14.2 the malformed-JSON response carries no stack trace",
      !looksLikeInternalLeak(bad.raw),
      `leak=${looksLikeInternalLeak(bad.raw)} body=${(bad.raw || "").slice(0, 180)}`
    );
    check(
      "C14.2b the error handler returns a generic message, not the parser error",
      !internalMessage(bad.raw),
      `leaked=${internalMessage(bad.raw)} body=${(bad.raw || "").slice(0, 180)}`
    );

    const big = await svc.rawPost("/login", JSON.stringify({ email: "a@krt.test", password: "x".repeat(2 * 1024 * 1024) }));
    check(
      "C14.3 an oversized body is a 4xx, not a 500",
      big.status >= 400 && big.status < 500,
      `status=${big.status} ${(big.raw || "").slice(0, 180)}`
    );

    const numEmail = await svc.post("/login", { email: 12345, password: "whatever-123" });
    check(
      "C14.4 a numeric email is a 4xx, not a 500",
      numEmail.status >= 400 && numEmail.status < 500,
      `status=${numEmail.status} ${(numEmail.raw || "").slice(0, 180)}`
    );

    const objEmail = await svc.post("/verify-otp", { email: { a: 1 }, otp: "123456", purpose: "checkout" });
    check(
      "C14.5 an object email on /verify-otp is a 4xx, not a 500",
      objEmail.status >= 400 && objEmail.status < 500,
      `status=${objEmail.status} ${(objEmail.raw || "").slice(0, 220)}`
    );
    check(
      "C14.5b the error handler returns a generic message, not the binder error",
      !internalMessage(objEmail.raw),
      `leaked=${internalMessage(objEmail.raw)} body=${(objEmail.raw || "").slice(0, 220)}`
    );

    // An object password against a REAL account reaches the async password
    // verifier - the path that used to throw inside an async handler and
    // kill the process with an unhandled rejection.
    const objPw = await svc.post("/login", { email: known, password: { a: 1 } });
    check(
      "C14.6 an object password is a 4xx, not a 500",
      objPw.status >= 400 && objPw.status < 500,
      `status=${objPw.status} ${(objPw.raw || "").slice(0, 180)}`
    );

    check(
      "C14.7 the service survived the hostile payloads (no unhandled rejection killed the process)",
      svc.alive(),
      `exit=${JSON.stringify(svc.child.exitCode)} stderr=${svc.stderr.slice(-300)}`
    );
    db.close();
  });
}

/* ========================================================== section: 13 */

async function sectionOtpStorage() {
  section("13. C6 — OTP entropy and storage (salted, legacy rows still work)");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await insertUser(db, { email, passwordHash: await userHash() });
    await svc.post("/send-otp", { email, purpose: "login" });
    const otp = await extractOtp(email, "login");
    const row = db.prepare("SELECT * FROM otps WHERE email = ? AND purpose = 'login' ORDER BY id DESC LIMIT 1").get(email);
    if (!check("C6.0 precondition: an OTP row exists", !!row && !!otp, JSON.stringify(row))) {
      db.close();
      return;
    }
    check(
      "C6.1 the otps table has a per-row salt column",
      tableColumns(db, "otps").includes("salt"),
      `columns=${tableColumns(db, "otps").join(",")}`
    );
    const legacy = crypto.createHash("sha256").update(otp + "krt-otp-salt").digest("hex");
    check(
      "C6.2 the stored OTP hash is salted (it is not sha256(otp + a constant))",
      row.otp_hash !== legacy,
      "the stored hash equals sha256(otp + 'krt-otp-salt') — the constant-salt scheme C6 forbids"
    );

    // Backwards compatibility: a row without a salt must still verify.
    const legacyEmail = uniq();
    await insertUser(db, { email: legacyEmail, passwordHash: await userHash() });
    const legacyOtp = "424242";
    const sample = db.prepare("SELECT expires_at FROM otps WHERE id = ?").get(row.id);
    const legacyExpiry = shiftExpiry(sample.expires_at, 10 * 60 * 1000);
    insertOtpRow(db, {
      email: legacyEmail,
      purpose: "login",
      hash: crypto.createHash("sha256").update(legacyOtp + "krt-otp-salt").digest("hex"),
      expiresAt: legacyExpiry,
      salt: null,
    });
    const res = await svc.post("/login-otp", { email: legacyEmail, otp: legacyOtp });
    check(
      "C6.3 a legacy constant-salt OTP row (no salt) still verifies",
      res.status === 200,
      `status=${res.status} ${(res.raw || "").slice(0, 180)}`
    );
    db.close();
  });
}

/* ========================================================== section: 14 */

async function sectionRating() {
  section("14. C12 — no rating mass assignment");

  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await svc.post("/send-otp", { email, purpose: "registration" });
    const otp = await extractOtp(email, "registration");
    const reg = otp
      ? await svc.post("/register", { email, password: PW, first_name: "T", otp, rating: 5 })
      : { status: 0, raw: "no OTP was issued", body: null };
    if (!check("C12.0 precondition: the user registered", reg.status === 200 || reg.status === 201, `status=${reg.status}`)) {
      db.close();
      return;
    }
    const cols = tableColumns(db, "users");
    const row = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
    if (!cols.includes("rating")) {
      check("C12.1 a client-supplied rating is not stored (the column is gone)", true);
    } else {
      check(
        "C12.1 a client-supplied rating is not stored",
        row && (row.rating === null || row.rating === undefined),
        `rating=${row ? row.rating : "no row"} (the client sent rating: 5)`
      );
    }
    db.close();
  });
}

/* ========================================================== section: 15 */

async function sectionNotification() {
  section("15. C10 — notification hardening");

  const src = fs.readFileSync(NOTIFY_SRC, "utf8");
  check(
    "C10.1 the notification service fails closed on an empty NOTIFY_TOKEN",
    !/if\s+NOTIFY_TOKEN\s+and/.test(src),
    "main.py still contains the fail-open `if NOTIFY_TOKEN and ...` check"
  );
  check(
    "C10.2 the notification service escapes user-controlled values",
    /html\.escape/.test(src),
    "main.py does not use html.escape"
  );

  await withFreshService(async (svc) => {
    await resetMock();
    await svc.post("/send-otp", { email: uniq(), purpose: "registration" });
    const sends = await mockSends();
    const otpSend = sends.find((s) => s.path === "/notify/otp");
    if (!check("C10.3 precondition: the auth service called /notify/otp", !!otpSend, `paths=${sends.map((s) => s.path).join(",")}`)) {
      return;
    }
    check(
      "C10.4 the auth service sends no pre-rendered html field",
      otpSend.body && !("html" in otpSend.body),
      `body=${JSON.stringify(otpSend.body).slice(0, 240)}`
    );
    check(
      "C10.5 no field of the notification payload carries raw markup",
      Object.values(otpSend.body || {}).every((v) => typeof v !== "string" || !/[<>]/.test(v)),
      `body=${JSON.stringify(otpSend.body).slice(0, 240)}`
    );
  });

  // devOtp must never appear — not even when the mailer is down.
  await withFreshService(async (svc) => {
    const res = await svc.post("/send-otp", { email: uniq(), purpose: "registration" });
    const leaked = /devOtp|dev_otp/i.test(res.raw || "");
    check(
      "C10.6 the response never carries devOtp (not even when the mailer fails)",
      !leaked,
      `status=${res.status} body=${(res.raw || "").slice(0, 200)}`
    );
    const fromLog = otpFromLog(svc.stdout);
    if (fromLog) {
      check(
        "C10.7 the OTP itself is not echoed in the response body when the mailer fails",
        !new RegExp(`\\b${fromLog}\\b`).test(res.raw || ""),
        `the OTP ${fromLog} appears in the response body`
      );
    } else {
      note("the OTP was not found in the service log — the plaintext-leak check could not run");
    }
  }, { notifyUrl: "http://127.0.0.1:1" });
}

/* ========================================================== section: 16 */

async function sectionFrontend() {
  section("16. C11 — frontend magic link (source level)");

  const src = fs.existsSync(AUTHFORM_SRC) ? stripComments(fs.readFileSync(AUTHFORM_SRC, "utf8")) : "";
  if (!src) {
    check("C11.0 the auth form source is present", false, `${AUTHFORM_SRC} not found`);
    return;
  }
  check(
    "C11.1 the magic-link route reads token and email from the query string on mount",
    /params\.get\(["']token["']\)/.test(src) && /setMagicToken\(/.test(src),
    "no query-string read of `token` / no setMagicToken() call"
  );
  check(
    "C11.2 the sign-in method is ONE piece of state (no independent loginOtp / loginMagicLink booleans)",
    !/loginOtp\b/.test(src) && !/loginMagicLink\b/.test(src) && /setMethod\(/.test(src),
    "the source still uses independent loginOtp / loginMagicLink state"
  );
  const canSubmit = src.slice(src.indexOf("canSubmit"), src.indexOf("canSubmit") + 700);
  check(
    "C11.3 the password policy still applies in the second signup step",
    /signupLengthOK/.test(canSubmit) && /signupMatchOK/.test(canSubmit) && /firstNameOK/.test(canSubmit),
    `canSubmit block: ${canSubmit.replace(/\s+/g, " ").slice(0, 220)}`
  );
  const signup = src.slice(src.indexOf("const handleSignup"), src.indexOf("const handleSignup") + 1200);
  check(
    "C11.4 the signup request does not send a rating",
    !/rating\s*[,:]/.test(signup),
    `handleSignup still sends a rating: ${signup.replace(/\s+/g, " ").slice(0, 220)}`
  );
}

/* ========================================================== section: 17 */

function sectionLeakScan() {
  section("17. C14/C7 — global leak scan over every response the suite collected");
  const offenders = [];
  for (const r of RESP_LOG) {
    const leak = looksLikeInternalLeak(r.raw);
    if (leak) offenders.push(`${r.method} ${r.path} -> ${r.status}: ${leak}`);
  }
  check(
    "C14.8 no response body anywhere contains a stack trace, node_modules path or SQL fragment",
    offenders.length === 0,
    offenders.slice(0, 6).join(" | ")
  );
  if (offenders.length === 0) note(`scanned ${RESP_LOG.length} responses`);

  const devOtp = RESP_LOG.filter((r) => /devOtp|dev_otp/i.test(r.raw || ""));
  check(
    "C7.7 no response of the whole suite ever carries devOtp",
    devOtp.length === 0,
    devOtp.slice(0, 4).map((r) => `${r.method} ${r.path} -> ${r.status}`).join(" | ")
  );

  const withTokens = RESP_LOG.filter((r) => bodyHasTokens(r));
  check(
    "C1.4 no auth response in the whole suite carries accessToken/refreshToken",
    withTokens.length === 0,
    withTokens.slice(0, 4).map((r) => `${r.method} ${r.path} -> ${r.status}`).join(" | ")
  );
}

/* =========================================================== section: 18 */

// Regression tests for the issues an adversarial review found AFTER the first
// green run. Each of these was a real defect; each must stay fixed.
async function sectionAdversarialRegressions() {
  section("18. regressions — defects found by the adversarial review");

  // C-2: an async route handler that throws used to kill the whole process
  // (Express 4 does not catch rejected promises).
  await withFreshService(async (svc) => {
    const db = svc.db();
    const email = uniq();
    await svc.post("/send-otp", { email, purpose: "registration" });
    const otp = await extractOtp(email, "registration");
    if (!check("R1.0 precondition: a registration OTP was issued", !!otp)) {
      db.close();
      return;
    }
    // A whitespace-only password reaches the ArgonVault canonicaliser, which
    // rejects an empty result by throwing.
    const r = await svc.post("/register", {
      email,
      password: "        ",
      first_name: "A",
      otp,
    });
    check(
      "R1.1 a whitespace-only password is a 4xx, not a crash",
      r.status >= 400 && r.status < 500,
      `status=${r.status} ${(r.raw || "").slice(0, 140)}`
    );
    await new Promise((r2) => setTimeout(r2, 500));
    check("R1.2 the service is still alive after it", svc.alive(), `exit=${JSON.stringify(svc.child.exitCode)}`);

    // Two concurrent registrations for one address: the second INSERT trips
    // the UNIQUE constraint, which used to be an unhandled rejection.
    const email2 = uniq();
    await svc.post("/send-otp", { email: email2, purpose: "registration" });
    const otp2 = await extractOtp(email2, "registration");
    if (otp2) {
      const [x, y] = await Promise.all([
        svc.post("/register", { email: email2, password: "attacker-password-1", first_name: "A", otp: otp2 }),
        svc.post("/register", { email: email2, password: "attacker-password-1", first_name: "A", otp: otp2 }),
      ]);
      // One of them may legitimately win (201) and create the account; the
      // other must be refused (409). What must NEVER happen is a 500 — that
      // was the unhandled UNIQUE-constraint rejection that killed the
      // service.
      const rows2 = db.prepare("SELECT COUNT(*) c FROM users WHERE lower(email) = ?").get(email2).c;
      check(
        "R1.3 concurrent duplicate registrations never 500, and create exactly one account",
        [x.status, y.status].every((s) => s === 201 || (s >= 400 && s < 500)) && rows2 === 1,
        `statuses=${x.status},${y.status} rows=${rows2}`
      );
      await new Promise((r3) => setTimeout(r3, 500));
      check("R1.4 the service survived the concurrent registrations", svc.alive(), `exit=${JSON.stringify(svc.child.exitCode)}`);
    }
    db.close();
  });

  // C-11: jwt.verify must pin the algorithm.
  await withFreshService(async (svc) => {
    const hs512 = jwt.sign({ userId: crypto.randomUUID(), email: uniq(), role: "CUSTOMER" }, JWT_SECRET, {
      expiresIn: "1h",
      algorithm: "HS512",
    });
    const res = await svc.get("/me", { Authorization: `Bearer ${hs512}` });
    check(
      "R2.1 a token signed with a different HMAC algorithm is rejected",
      res.status === 401,
      `status=${res.status} ${(res.raw || "").slice(0, 120)}`
    );
  });

  // C-8: a legacy mixed-case row must still be found by a normalised login.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const mixed = `Legacy.User@${Date.now().toString(36)}.Example.COM`;
    await insertUser(db, { email: mixed, passwordHash: await userHash() });
    const res = await svc.post("/login", { email: mixed.toLowerCase(), password: PW });
    check(
      "R3.1 a legacy mixed-case account is still reachable through a normalised login",
      res.status === 200,
      `status=${res.status} ${(res.raw || "").slice(0, 160)}`
    );
    const res2 = await svc.post("/login", { email: `  ${mixed.toLowerCase()}  `, password: PW });
    check(
      "R3.2 the padded, lowercased form reaches the same legacy account",
      res2.status === 200,
      `status=${res2.status} ${(res2.raw || "").slice(0, 160)}`
    );
    db.close();
  });

  // C-4: an unknown address must not answer dramatically faster than a known
  // one — that difference is an account-enumeration oracle even when the
  // bodies are identical.
  await withFreshService(async (svc) => {
    const db = svc.db();
    const known = uniq();
    await insertUser(db, { email: known, passwordHash: await userHash() });
    const time = async (email) => {
      const t0 = process.hrtime.bigint();
      await svc.post("/login", { email, password: "definitely-not-the-password" });
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    await time(known); // warm up
    const knownTimes = [];
    const unknownTimes = [];
    for (let i = 0; i < 5; i++) {
      knownTimes.push(await time(known));
      unknownTimes.push(await time(uniq()));
    }
    const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const k = median(knownTimes);
    const u = median(unknownTimes);
    // The unknown path must cost at least a third of the known path. The old
    // code skipped Argon2 entirely and answered in ~2 ms vs ~50 ms.
    check(
      "R4.1 an unknown address does not answer dramatically faster than a known one",
      u >= k / 3,
      `known median=${k.toFixed(1)}ms unknown median=${u.toFixed(1)}ms ratio=${(k / Math.max(u, 0.001)).toFixed(1)}x`
    );
    db.close();
  });

  // C-3: the storefront must send credentials so the httpOnly cookie is
  // actually stored (the API is a different origin).
  const authFormSrc = fs.existsSync(AUTHFORM_SRC) ? stripComments(fs.readFileSync(AUTHFORM_SRC, "utf8")) : "";
  const checkoutSrc = fs.existsSync(CHECKOUT_SRC) ? stripComments(fs.readFileSync(CHECKOUT_SRC, "utf8")) : "";
  const fetches = (src) => {
    const out = [];
    const re = /await fetch\([\s\S]{0,400}?\}\);/g;
    let m;
    while ((m = re.exec(src))) out.push(m[0]);
    return out;
  };
  const allFetches = [...fetches(authFormSrc), ...fetches(checkoutSrc)];
  const withoutCreds = allFetches.filter((f) => !/credentials\s*:\s*["']include["']/.test(f));
  check(
    "R5.1 every storefront fetch to the API sends credentials:'include' (the session cookie is cross-origin)",
    allFetches.length > 0 && withoutCreds.length === 0,
    `${withoutCreds.length}/${allFetches.length} fetches lack it`
  );

  // C-1: the gateway must strip a client-supplied X-Forwarded-For.
  // BEHAVIOURAL, not a source grep: the previous version only read the
  // gateway's source, and it PASSED while the fix was dead code —
  // http-proxy-middleware v3 ignores the legacy top-level onProxyReq option,
  // so the handler never ran and the client's header reached the upstream
  // verbatim. This starts the real gateway against a real echo upstream.
  {
    const upPort = await freePort();
    const gwPort = await freePort();
    const echo = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        xff: req.headers["x-forwarded-for"] || null,
        real: req.headers["x-real-ip"] || null,
        fwd: req.headers["forwarded"] || null,
      }));
    });
    await new Promise((r) => echo.listen(upPort, "127.0.0.1", r));
    const gw = spawn(process.execPath, [GATEWAY_SRC], {
      cwd: path.join(ROOT, "services", "api-gateway"),
      env: {
        ...process.env,
        PORT: String(gwPort),
        AUTH_SERVICE_URL: `http://127.0.0.1:${upPort}`,
        CATALOG_SERVICE_URL: `http://127.0.0.1:${upPort}`,
        CART_SERVICE_URL: `http://127.0.0.1:${upPort}`,
        ORDER_SERVICE_URL: `http://127.0.0.1:${upPort}`,
        PAYMENT_SERVICE_URL: `http://127.0.0.1:${upPort}`,
        NOTIFICATION_SERVICE_URL: `http://127.0.0.1:${upPort}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let gwOut = "";
    gw.stdout.on("data", (d) => (gwOut += d));
    gw.stderr.on("data", (d) => (gwOut += d));
    try {
      await waitForPort(gwPort);
      const viaGateway = (headers) =>
        new Promise((resolve) => {
          http
            .get({ hostname: "127.0.0.1", port: gwPort, path: "/api/auth/me", headers }, (res) => {
              let d = "";
              res.on("data", (c) => (d += c));
              res.on("end", () => resolve(d));
            })
            .on("error", (e) => resolve(`ERR ${e.message}`));
        });
      const spoofed = JSON.parse(await viaGateway({ "x-forwarded-for": "203.0.113.99" }));
      check(
        "R6.1 the gateway strips a client-supplied X-Forwarded-For (behavioural)",
        spoofed.xff !== "203.0.113.99",
        `upstream saw x-forwarded-for=${spoofed.xff}`
      );
      const spoofedReal = JSON.parse(await viaGateway({ "x-real-ip": "203.0.113.98" }));
      check(
        "R6.2 the gateway strips a client-supplied X-Real-IP",
        spoofedReal.real !== "203.0.113.98",
        `upstream saw x-real-ip=${spoofedReal.real}`
      );
      const list = JSON.parse(await viaGateway({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }));
      check(
        "R6.3 a multi-entry X-Forwarded-For cannot smuggle an address through",
        list.xff !== "1.1.1.1, 2.2.2.2, 3.3.3.3",
        `upstream saw x-forwarded-for=${list.xff}`
      );
      check(
        "R6.4 the gateway's proxyReq handler actually runs (http-proxy-middleware v3 API)",
        /\[Gateway\] →/.test(gwOut),
        "the gateway logged no proxied request — the on:{} handlers are not wired"
      );
    } finally {
      try { gw.kill(); } catch { /* ignore */ }
      try { echo.close(); } catch { /* ignore */ }
    }
  }

  // C-5/C-6: the deployment must not ship the old secret or an unset NODE_ENV.
  const composeSrc = fs.existsSync(COMPOSE_SRC) ? fs.readFileSync(COMPOSE_SRC, "utf8") : "";
  check(
    "R7.1 docker-compose no longer pins the old default JWT secret",
    !/krt-store-secret-key-dev/.test(composeSrc),
    "the literal C2 ordered deleted is still in docker-compose.yml"
  );
  check(
    "R7.2 docker-compose sets NODE_ENV=production for the auth service",
    /NODE_ENV=production/.test(composeSrc),
    "without it the service takes the dev path: live OTPs on stdout and cookies without Secure"
  );
  check(
    "R7.3 docker-compose does not publish the auth service directly (only the gateway)",
    !/auth-service:[\s\S]{0,400}?\n\s*ports:/.test(composeSrc),
    "a directly published auth service lets a client forge X-Forwarded-For"
  );
  check(
    "R7.4 docker-compose mounts the ArgonVault pepper (without it every auth call fails)",
    /ARGONVAULT_PEPPER_PATH/.test(composeSrc) && /pepper\.key/.test(composeSrc),
    "the pepper is not provided to the container, so registrations 500 and logins 401"
  );
  check(
    "R7.5 the auth service refuses to start without a usable pepper in production",
    /assertPepperAvailable/.test(fs.readFileSync(path.join(ROOT, "services", "auth-service", "index.js"), "utf8")),
    "a missing pepper must be fatal, not a silent half-working service"
  );

  // C-2 (round 2): the error handler must be the LAST middleware, otherwise
  // an error in a later route reaches Express's default HTML page, which
  // prints a stack trace.
  {
    const src = fs.readFileSync(AUTH_INDEX, "utf8");
    const handlerAt = src.indexOf("app.use((err, req, res, next)");
    const lastRouteAt = Math.max(
      src.lastIndexOf("app.post("),
      src.lastIndexOf("app.get(")
    );
    check(
      "R8.1 the error handler is registered AFTER every route (otherwise it never catches)",
      handlerAt > 0 && handlerAt > lastRouteAt,
      `handler at ${handlerAt}, last route at ${lastRouteAt}`
    );
  }

  // C-2 (round 2): /send-magic-link had no per-recipient cap.
  await withFreshService(async (svc) => {
    const email = uniq();
    const st = [];
    for (let i = 0; i < 8; i++) {
      st.push(
        (await svc.post("/send-magic-link", { email }, { "x-forwarded-for": `198.51.100.${i + 1}` })).status
      );
    }
    check(
      "R9.1 /send-magic-link is capped per RECIPIENT even when the client IP rotates",
      st.includes(429),
      `statuses=${st.join(",")} (unbounded = inbox flood + unbounded magic_links rows)`
    );
  });
}

/* ------------------------------------------------------------------ main */

async function main() {
  console.log("KRT auth-security adversarial suite");
  console.log(`  auth entry point : ${AUTH_INDEX}`);
  console.log(`  mock notification: ${MOCK_INDEX}`);
  console.log(`  frontend url     : ${FRONTEND_URL}`);
  console.log(`  notify token     : ${NOTIFY_TOKEN}`);

  if (!NOTIFY_BASE) {
    const port = await freePort();
    const child = spawn(process.execPath, [MOCK_INDEX, String(port)], {
      cwd: __dirname,
      env: Object.assign({}, process.env, { NOTIFY_TOKEN }),
      stdio: ["ignore", "ignore", "inherit"],
    });
    NOTIFY_BASE = `http://127.0.0.1:${port}`;
    try {
      await waitForPort(port, 10000);
    } catch (e) {
      console.error("could not start the mock notification service:", e.message);
      process.exit(2);
    }
    console.log(`  started mock on  : ${NOTIFY_BASE}`);
    process.on("exit", () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    });
  } else {
    console.log(`  using mock       : ${NOTIFY_BASE}`);
  }

  const ok = await sectionHarness();
  if (!ok) {
    console.log("\nFATAL: the harness could not start — aborting.");
    process.exit(2);
  }

  await sectionRateLimit();
  await sectionOtpAttempts();
  await sectionOtpLifecycle();
  await sectionEnumeration();
  await sectionPurpose();
  await sectionMagicLink();
  await sectionTokenTransport();
  await sectionSecret();
  await sectionMeIdentity();
  await sectionNormalisation();
  await sectionAdmin();
  await sectionErrors();
  await sectionOtpStorage();
  await sectionRating();
  await sectionNotification();
  await sectionFrontend();
  sectionLeakScan();
  await sectionAdversarialRegressions();

  // Give the killed children a moment to release their SQLite handles before
  // the throwaway directories are removed.
  await new Promise((r) => setTimeout(r, 400));
  for (const d of TMP_DIRS) {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch {
      /* a locked temp dir is not worth failing the run over */
    }
  }

  console.log(`\n================ ${pass} passed, ${fail} failed, ${skipped} skipped ================`);
  if (failures.length) {
    console.log("\nFAILURES:");
    failures.forEach((f) => console.log("  - " + f));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e && e.stack ? e.stack : e);
  process.exit(2);
});
