// ponytail: the CSP ships TWICE -- as a real header in public/_headers and as
// a <meta> tag in the layout -- because Netlify's _headers cannot interpolate
// a build-time env var and the Astro dev server does not read _headers at
// all. A comment cannot keep two copies of a policy from drifting; only an
// assertion can. This is that assertion.
//
//   node scripts/check-csp.mjs
//
// It fails when:
//   - public/_headers has no Content-Security-Policy / Strict-Transport-Security
//   - the header policy is NARROWER than the <meta> policy (that would break
//     the API calls in production, silently)
//   - a directive of the <meta> policy is missing from the header policy
//   - the header policy is not the one src/data/csp.js exports
//   - the built dist/index.html carries a different <meta> policy than
//     src/data/csp.js builds for PUBLIC_API_URL
//
// The header CANNOT be stricter than the tag, only looser: a browser enforces
// both policies, so the effective one is their intersection.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

import { buildCsp, HEADER_CSP, apiOrigin } from "../src/data/csp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

// --- public/_headers ------------------------------------------------------

// The file is a path block followed by indented "Name: value" lines.
function parseHeadersFile(path) {
  const blocks = [];
  let current = null;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { path: line, headers: {} };
      blocks.push(current);
      continue;
    }
    const separator = line.indexOf(":");
    assert.ok(current, `header line outside a path block: ${raw}`);
    current.headers[line.slice(0, separator).trim().toLowerCase()] = line
      .slice(separator + 1)
      .trim();
  }
  return blocks;
}

function parseCsp(policy) {
  const directives = new Map();
  for (const part of policy.split(";")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const space = chunk.indexOf(" ");
    const name = (space === -1 ? chunk : chunk.slice(0, space)).toLowerCase();
    const value = space === -1 ? "" : chunk.slice(space + 1).trim();
    directives.set(name, value);
  }
  return directives;
}

// Does a source in the header's connect-src cover a source in the tag's?
function covers(headerSources, source) {
  if (headerSources.includes("*")) return true;
  if (headerSources.includes(source)) return true;
  if (source === "'self'") return headerSources.includes("'self'");
  // A scheme source ("https:") covers every host on that scheme.
  if (source.endsWith(":")) return headerSources.includes(source);
  const [scheme, host] = source.split("://");
  if (headerSources.includes(`${scheme}:`)) return true;
  for (const candidate of headerSources) {
    if (!candidate.includes("*") || !candidate.includes("://")) continue;
    const [candidateScheme, candidateHost] = candidate.split("://");
    if (candidateScheme !== scheme) continue;
    if (candidateHost.startsWith("*.")) {
      const base = candidateHost.slice(2);
      if (host === base || host.endsWith(`.${base}`)) return true;
    } else if (candidateHost === host) {
      return true;
    }
  }
  return false;
}

const isLocalOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin ?? "");

const blocks = parseHeadersFile(join(root, "public", "_headers"));
const global = blocks.find((block) => block.path === "/*");
assert.ok(global, "public/_headers has no /* block");
const headers = global.headers;

console.log("Content-Security-Policy drift check");

check("public/_headers sends a Content-Security-Policy header", () => {
  assert.ok(headers["content-security-policy"], "no Content-Security-Policy header");
});

check("the header policy is the one src/data/csp.js exports", () => {
  assert.equal(
    headers["content-security-policy"],
    HEADER_CSP,
    "public/_headers and src/data/csp.js disagree -- copy HEADER_CSP into public/_headers"
  );
});

check("the header policy is not narrower than the <meta> policy", () => {
  const apiUrl = process.env.PUBLIC_API_URL;
  const origin = apiOrigin(apiUrl);
  const meta = parseCsp(buildCsp(apiUrl));
  const header = parseCsp(headers["content-security-policy"]);

  for (const [name, value] of meta) {
    if (name === "connect-src") continue;
    assert.equal(
      header.get(name),
      value,
      `directive "${name}" is missing or different in the header (tag: "${value}")`
    );
  }

  const headerSources = (header.get("connect-src") ?? "").split(/\s+/).filter(Boolean);
  const metaSources = (meta.get("connect-src") ?? "").split(/\s+/).filter(Boolean);
  if (isLocalOrigin(origin)) {
    // Dev origin: the Astro dev server never applies _headers, so the header
    // only has to be broad enough for the (https) production origin.
    assert.ok(
      headerSources.includes("*") || headerSources.includes("https:"),
      `the header's connect-src (${headerSources.join(" ")}) would not cover the production API origin`
    );
  } else {
    for (const source of metaSources) {
      assert.ok(
        covers(headerSources, source),
        `the header's connect-src (${headerSources.join(" ")}) does not cover "${source}" -- that would block the API in production`
      );
    }
  }
});

check("frame-ancestors 'none' is in the header only", () => {
  const header = parseCsp(headers["content-security-policy"]);
  assert.equal(header.get("frame-ancestors"), "'none'", "the header has no frame-ancestors 'none'");
  const meta = parseCsp(buildCsp(process.env.PUBLIC_API_URL));
  assert.equal(
    meta.get("frame-ancestors"),
    undefined,
    "frame-ancestors is ignored in a <meta> tag and Chrome logs it as a console error"
  );
});

check("public/_headers sends Strict-Transport-Security", () => {
  const hsts = headers["strict-transport-security"];
  assert.ok(hsts, "no Strict-Transport-Security header");
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1]);
  assert.ok(Number.isFinite(maxAge), `"${hsts}" has no max-age`);
  assert.ok(maxAge >= 31536000, `max-age is ${maxAge}s -- the preload list needs 31536000`);
  assert.match(hsts, /includeSubDomains/, `"${hsts}" has no includeSubDomains`);
});

check("the built page carries the policy from src/data/csp.js", () => {
  const built = join(root, "dist", "index.html");
  if (!existsSync(built)) {
    console.log("       (skipped: dist/index.html does not exist -- run the build first)");
    return;
  }
  const html = readFileSync(built, "utf8");
  const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
  assert.ok(match, "dist/index.html has no <meta> Content-Security-Policy>");
  // The API origin is read back out of the built page, so the check works
  // whatever PUBLIC_API_URL the page was built with.
  const builtOrigin = /connect-src 'self' ([^;]+)/.exec(match[1])?.[1];
  assert.equal(
    match[1],
    buildCsp(builtOrigin),
    "the built <meta> policy is not the one src/data/csp.js builds -- layout and policy have drifted"
  );
});

// ponytail: the HEADER's connect-src is deliberately broader than the tag's
// (it says https:, the tag names the API origin). That is safe ONLY because
// a browser enforces both and the effective policy is their intersection.
// It stops being safe the moment a page ships WITHOUT the <meta> tag: the
// header alone would then permit a fetch to any https origin. The drift
// check above only proves the two policies agree -- it does not prove every
// page carries the strict one. This does.
check("EVERY built page carries the <meta> policy", () => {
  const dist = join(root, "dist");
  if (!existsSync(dist)) {
    console.log("       (skipped: dist/ does not exist -- run the build first)");
    return;
  }
  const missing = [];
  let checked = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".html")) {
        checked++;
        const html = readFileSync(full, "utf8");
        if (!/<meta http-equiv="Content-Security-Policy"/.test(html)) {
          missing.push(full.replace(`${root}/`, ""));
        }
      }
    }
  };
  walk(dist);
  assert.ok(checked > 0, "no built HTML pages were found");
  assert.equal(
    missing.length,
    0,
    `these pages have no <meta> policy, so the broader header policy would be the only one that applies: ${missing.join(", ")}`
  );
});

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll CSP checks passed.");
