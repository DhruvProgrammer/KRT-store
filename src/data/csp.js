// ponytail: ONE Content-Security-Policy, delivered TWICE.
//
// The policy has to be a real HTTP header (public/_headers): a
// <meta http-equiv> policy ignores frame-ancestors completely, and it cannot
// cover anything the browser already fetched before it parsed the tag.
//
// The Astro dev/preview server never reads public/_headers, so the policy
// ALSO ships as a <meta> tag, built from this module. A browser enforces
// BOTH policies -- the effective policy is the intersection -- so the tag
// can only ever make a page STRICTER, never looser.
//
// Netlify's _headers file cannot interpolate a build-time env var (only
// netlify.toml supports placeholder substitution), so the header cannot name
// the deploy-time API origin. The header therefore allows any https origin
// and the <meta> tag -- which CAN read PUBLIC_API_URL -- carries the strict
// one. scripts/check-csp.mjs fails when the header is ever narrower than the
// tag, so the header can never silently break login/checkout in production.
//
// Ceiling: the header's connect-src stays broad until the API origin is
// fixed. Upgrade path: generate dist/_headers at build time (Astro
// integration hook, or a netlify.toml [[headers]] entry with a placeholder
// substituted by the build command) and drop the "https:" scheme source.
//
// ponytail: this file is plain JS, not TS, on purpose. It is imported by
// scripts/check-csp.mjs, which runs as part of `npm run build` on whatever
// Node the deploy host happens to have. A .ts import there needs Node's
// type stripping (22.18+), so the build would hard-fail on Node 20. Plain
// JS with JSDoc types works on every Node the repo supports, and the
// tsconfig has allowJs, so the types still flow into the Astro consumer.

// The policy, one directive per entry, in the order it is emitted.
// connect-src is the only directive that differs between the two deliveries.
/** @type {Array<[string, string]>} */
const DIRECTIVES = [
  ["default-src", "'self'"],
  ["script-src", "'self' 'unsafe-inline'"],
  ["style-src", "'self' 'unsafe-inline'"],
  ["img-src", "'self' data: blob:"],
  ["font-src", "'self'"],
  ["connect-src", ""],
  ["object-src", "'none'"],
  ["frame-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"]
];

/**
 * ponytail: CSP host-source needs an ORIGIN. A path-carrying PUBLIC_API_URL
 * ("https://api.x.com/v1") is a silent mismatch that would block every fetch,
 * so normalise through URL instead of trusting the raw env string.
 * @param {string | undefined | null} apiUrl
 * @returns {string | null}
 */
export function apiOrigin(apiUrl) {
  if (!apiUrl) return null;
  try {
    return new URL(apiUrl).origin;
  } catch {
    return null;
  }
}

/**
 * @param {Array<[string, string]>} pairs
 * @returns {string}
 */
function serialize(pairs) {
  return pairs.map(([name, value]) => `${name} ${value}`).join("; ") + ";";
}

/**
 * The one policy, parameterised by the two things that differ: the
 * connect-src value, and frame-ancestors (ignored in a <meta> tag, so it is
 * only ever emitted for the header).
 * @param {string} connect
 * @param {boolean} withFrameAncestors
 * @returns {string}
 */
function policy(connect, withFrameAncestors) {
  /** @type {Array<[string, string]>} */
  const pairs = [];
  for (const [name, value] of DIRECTIVES) {
    pairs.push([name, name === "connect-src" ? connect : value]);
    if (name === "frame-src" && withFrameAncestors) {
      pairs.push(["frame-ancestors", "'none'"]);
    }
  }
  return serialize(pairs);
}

/**
 * The <meta> policy. connect-src must keep the API gateway origin or every
 * auth/checkout fetch is blocked.
 * @param {string | undefined | null} apiUrl
 * @returns {string}
 */
export function buildCsp(apiUrl) {
  const origin = apiOrigin(apiUrl);
  return policy(origin ? `'self' ${origin}` : "'self'", false);
}

// The header policy. Same directives, plus frame-ancestors 'none' (ignored in
// a <meta> tag) and a connect-src that can never be narrower than the tag's.
export const HEADER_CSP = policy("'self' https:", true);
