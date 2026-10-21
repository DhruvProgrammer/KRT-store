// Mock notification service for auth-security tests.
//
// Stands in for the Python FastAPI service (services/notification-service/main.py)
// so the tests never touch Gmail, but it is a FAITHFUL stand-in: the same routes,
// the same required payload fields, the same validation rules. A mock that
// accepted everything would let a broken auth service look healthy.
//
// Routes (mirroring main.py):
//   POST /notify/otp         {email, subject, otp, purpose?, store_name?}
//   POST /notify/magic-link  {email, subject, link, purpose?, store_name?}
//   POST /notify/order       {email, order_id, items, total, ...}
//   GET  /health
//   GET  /__sent             every recorded request (including rejected ones)
//   GET  /__reset            clear the recording
//   GET  /__config           the mock's own configuration
//
// Fidelity rules (all of them mirror main.py):
//   - a missing required field            -> 422 (pydantic)
//   - an invalid email                     -> 422 (pydantic EmailStr)
//   - a purpose outside the allowlist      -> 400
//   - CR/LF in subject or store_name       -> 400
//   - a magic link that is not http(s)     -> 400
//   - an unknown route                     -> 404
//   - a missing/incorrect notify token    -> 401
//   - an unset NOTIFY_TOKEN               -> 503 for every call (fail closed)
//
// Env:
//   NOTIFY_TOKEN            the shared secret (REQUIRED -- no default)
//   MOCK_NOTIFY_PURPOSES   csv of allowed purposes
//                          (default: registration,login,checkout,signin)
//   MOCK_NOTIFY_FAIL_PATHS csv of paths that answer 502 "email send failed"
//   MOCK_NOTIFY_STRICT     0 -> accept unknown routes with 200 (legacy behaviour)
//
// Run: node services/test/mock-notify.cjs [port]

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2] || process.env.MOCK_NOTIFY_PORT || 8000);
const LOG = path.join(__dirname, "mock-notify-log.json");
// Fail closed, like the real service: an unset token must not mean "open".
// ponytail: there used to be a DEFAULT TOKEN here -- the same string as the
// LIVE production NOTIFY_TOKEN, committed to a public repo. The comment above
// already said an unset token must fail closed; the code did the opposite.
// Now an unset NOTIFY_TOKEN means "no token matches", so every call is
// rejected. The test suite passes its own throwaway token in the env.
const EXPECT_TOKEN = process.env.NOTIFY_TOKEN || "";
const ALLOWED_PURPOSES = (process.env.MOCK_NOTIFY_PURPOSES || "registration,login,checkout,signin")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FAIL_PATHS = (process.env.MOCK_NOTIFY_FAIL_PATHS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const STRICT = process.env.MOCK_NOTIFY_STRICT !== "0";

const ROUTES = {
  "/notify/otp": { required: ["email", "otp"], purpose: true },
  "/notify/magic-link": { required: ["email", "link"], purpose: true },
  "/notify/order": { required: ["email", "order_id", "items"], purpose: false },
};

// A real (fake) Gmail would deliver. We only record.
const sent = [];
function record(entry) {
  sent.push(entry);
  try {
    fs.writeFileSync(LOG, JSON.stringify(sent, null, 2));
  } catch {
    /* ignore */
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      if (!d) return resolve({});
      try {
        resolve(JSON.parse(d));
      } catch {
        resolve({ __unparsed: d });
      }
    });
  });
}

function fieldError(loc, msg) {
  return { detail: [{ loc: ["body", loc], msg }] };
}

// Mirror of main.py's request-layer validation.
function validate(pathname, body) {
  const route = ROUTES[pathname];
  if (!route) {
    return STRICT ? { status: 404, body: { detail: "Not Found" } } : null;
  }
  for (const field of route.required) {
    const v = body[field];
    if (v === undefined || v === null || v === "") {
      return { status: 422, body: fieldError(field, "field required") };
    }
  }
  if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return { status: 422, body: fieldError("email", "value is not a valid email address") };
  }
  if (route.purpose && body.purpose !== undefined && !ALLOWED_PURPOSES.includes(body.purpose)) {
    return { status: 400, body: { detail: "invalid purpose" } };
  }
  for (const field of ["subject", "store_name"]) {
    if (typeof body[field] === "string" && /[\r\n]/.test(body[field])) {
      return { status: 400, body: { detail: `invalid ${field}` } };
    }
  }
  if (pathname === "/notify/magic-link" && !/^https?:\/\//i.test(String(body.link))) {
    return { status: 400, body: { detail: "invalid link" } };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);

  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  if (url.pathname === "/health") {
    return send(200, { status: "ok" });
  }

  // Test-control endpoints. Deliberately BEFORE the token check so the suite
  // can always inspect and reset the recording.
  if (url.pathname === "/__sent") {
    return send(200, sent);
  }
  if (url.pathname === "/__reset") {
    sent.length = 0;
    try {
      fs.writeFileSync(LOG, "[]");
    } catch {
      /* ignore */
    }
    return send(200, { ok: true });
  }
  if (url.pathname === "/__config") {
    return send(200, {
      token: EXPECT_TOKEN ? "set" : "unset",
      allowedPurposes: ALLOWED_PURPOSES,
      failPaths: FAIL_PATHS,
      strict: STRICT,
      routes: Object.keys(ROUTES),
    });
  }

  // Mirror the real service's token check so tests can assert fail-closed.
  if (!EXPECT_TOKEN) {
    record({ path: url.pathname, status: 503, headers: req.headers, body, rejected: true });
    return send(503, { detail: "notification service not configured" });
  }
  if (req.headers["x-notify-token"] !== EXPECT_TOKEN) {
    record({ path: url.pathname, status: 401, headers: req.headers, body, rejected: true });
    return send(401, { detail: "invalid token" });
  }

  const invalid = validate(url.pathname, body);
  if (invalid) {
    record({ path: url.pathname, status: invalid.status, headers: req.headers, body, rejected: true });
    return send(invalid.status, invalid.body);
  }

  if (FAIL_PATHS.includes(url.pathname)) {
    record({ path: url.pathname, status: 502, headers: req.headers, body, rejected: true });
    return send(502, { detail: "email send failed" });
  }

  record({ path: url.pathname, status: 200, headers: req.headers, body });
  return send(200, { sent: true });
});

server.listen(PORT, () => {
  console.log(`[mock-notify] listening on :${PORT} token=${EXPECT_TOKEN ? "set" : "unset"}`);
});
