import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// The production domain. Overridable with PUBLIC_SITE_URL (deploy env); the
// default keeps `npm run build` working with no setup at all.
const DEFAULT_SITE_URL = "https://krt.design";
const DEFAULT_SITE_HOST = new URL(DEFAULT_SITE_URL).hostname;

// ponytail: the site URL is baked into EVERY canonical, og:url, JSON-LD
// `url`/`logo`/`offers.url` and the sitemap. Shipping the IANA placeholder
// (example.com — a domain that will never resolve) is a total de-index, so
// the build refuses a bad value instead of quietly shipping a wrong domain.
//
// The value must be a bare ORIGIN: scheme + host (+ port). A path, a query
// string, a fragment or userinfo would all produce broken canonicals, and
// "https://evil.com/?x=krt.design" is how a placeholder check gets bypassed.
//
// The host must also be the production host. A typo like
// "https://krt.design.evil.com" is otherwise accepted and silently de-indexes
// the site. Set ALLOW_CUSTOM_SITE_URL=true to build for a different domain
// (a staging host, for example).
function resolveSiteUrl(raw, { strict }) {
  const source = raw || DEFAULT_SITE_URL;
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`PUBLIC_SITE_URL is not a valid URL ("${source}").`);
  }
  // The dev and preview servers must not die on a local value. The project's
  // own .env uses "http://localhost:3001" for the API, so a developer who
  // adds PUBLIC_SITE_URL=http://localhost:4321 would otherwise get a dead
  // `npm run dev` from a variable they never knew was guarded. The strict
  // rules are a BUILD gate — that is the only thing that ships.
  if (!strict) {
    return url.origin;
  }
  if (url.protocol !== "https:") {
    throw new Error(`PUBLIC_SITE_URL must use https:// ("${source}").`);
  }
  if (url.username || url.password) {
    throw new Error(`PUBLIC_SITE_URL must not contain credentials ("${source}").`);
  }
  if (url.search || url.hash) {
    throw new Error(
      `PUBLIC_SITE_URL must be a bare origin with no query or fragment ("${source}").`
    );
  }
  if (url.pathname && url.pathname !== "/") {
    throw new Error(`PUBLIC_SITE_URL must not include a path ("${source}").`);
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1") {
    throw new Error(`PUBLIC_SITE_URL is insecure ("${source}"). Production must not be localhost.`);
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    throw new Error(`PUBLIC_SITE_URL is insecure ("${source}"). Production must not be a private IP.`);
  }
  if (/example\.(com|org|net)|your-store/i.test(host)) {
    throw new Error(`PUBLIC_SITE_URL is still a placeholder ("${source}"). Set the real production domain.`);
  }
  const customHost = host !== DEFAULT_SITE_HOST;
  if (customHost && process.env.ALLOW_CUSTOM_SITE_URL !== "true") {
    throw new Error(
      `PUBLIC_SITE_URL host "${host}" is not the production host "${DEFAULT_SITE_HOST}". ` +
        `A wrong domain here de-indexes every page. Set ALLOW_CUSTOM_SITE_URL=true if this is intentional.`
    );
  }
  // url.port is "" for the default https port. Any other port rides along
  // into url.origin and therefore into every canonical, every og:url and
  // every sitemap entry, so "https://krt.design:8443" would move the whole
  // site onto an origin that does not resolve.
  if (url.port && !customHost) {
    throw new Error(
      `PUBLIC_SITE_URL must not include a port ("${source}"). ` +
        `A port moves every canonical and sitemap entry onto another origin.`
    );
  }
  return url.origin;
}

const rawSiteUrl = process.env.PUBLIC_SITE_URL;
const siteUrl = resolveSiteUrl(rawSiteUrl, { strict: process.argv.includes("build") });

// ponytail: fail the build if PUBLIC_API_URL is missing, and fail a
// PRODUCTION build if it is insecure.
//
// The insecure check used to run on every build, which meant "npm run build"
// could not run locally at all: the project's own .env has
// PUBLIC_API_URL=http://localhost:3001, which is exactly the value the
// check rejected. The check exists to catch "http://localhost:3001 leaked
// into production" -- that URL hits the visitor's own machine (or a
// DNS-hijacked resolver), and the previous build silently shipped it
// because the fallback "|| http://localhost:3001" in AuthForm/CheckoutForm
// masked the missing env var on Netlify.
//
// So it is now a production gate. Netlify sets CONTEXT=production and
// NETLIFY=true in the build environment, so the deploy is still guarded; a
// local build points at the local gateway and is allowed to.
//
// NODE_ENV is deliberately NOT the signal: Astro sets NODE_ENV=production
// before it evaluates this config, so it is "production" for a local build
// too and it says nothing about where the build is going.
const isBuildCommand = process.argv.includes("build");
const isProductionBuild =
  isBuildCommand &&
  (process.env.CONTEXT === "production" ||
    process.env.NETLIFY === "true" ||
    process.env.PRODUCTION_BUILD === "true");
if (isBuildCommand) {
  const apiUrl = process.env.PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error(
      "PUBLIC_API_URL is not set. Set it in .env (dev) or in the Netlify deploy env (prod). " +
      "Example: PUBLIC_API_URL=https://api.example.com"
    );
  }
  if (isProductionBuild && (apiUrl.includes("localhost") || apiUrl.startsWith("http://"))) {
    throw new Error(
      `PUBLIC_API_URL is insecure ("${apiUrl}"). Production must be https:// and must not be localhost.`
    );
  }
}

// ponytail: sitemap = ALLOW list, not deny list. A deny list silently ships
// every new page and leaks /admin/, /cart/, /login-with-code/ into the
// sitemap; an allow list forces a route to be opted in on purpose.
// Anchored on the PATHNAME (not the full URL) so a slug can never match by
// accident, and `/login-with-code` cannot slip through a `/login` prefix test.
const SITEMAP_EXACT_PATHS = new Set([
  "/",
  "/store/",
  "/extras/",
  "/licensing/",
  "/privacy/",
  "/terms/"
]);
const SITEMAP_DETAIL_PATTERN = /^\/(store|extras)\/[^/]+\/$/;
const isIndexablePath = (pathname) =>
  SITEMAP_EXACT_PATHS.has(pathname) || SITEMAP_DETAIL_PATTERN.test(pathname);

// Build-time stamp for <lastmod>. Google actually uses it; changefreq and
// priority are ignored by Google but honoured by other crawlers.
const sitemapLastmod = new Date().toISOString();


export default defineConfig({
  site: siteUrl,
  // ponytail: "ignore", so BOTH "/store" and "/store/" resolve. The canonical
  // on every page is the SLASHED form (it is derived from the route path, not
  // from the request), and the sitemap lists the slashed form too, so Google
  // still sees exactly one URL per page -- but a link that lost its trailing
  // slash (a chat client, a QR code, a hand-typed URL) gets the page instead
  // of a 404. The built artefact is byte-identical either way; only the dev
  // and preview servers route differently.
  //
  // It was "always" here before, which made the dev server 404 "/store" and
  // hid the extensionless links (ExtraCard, SearchModal, CartList) that were
  // still shipping -- those are fixed, and all internal hrefs now carry the
  // slash so they match the canonical.
  trailingSlash: "ignore",
  integrations: [
    react(),
    tailwind(),
    sitemap({
      filter: (page) => isIndexablePath(new URL(page).pathname),
      serialize: (item) => {
        const { pathname } = new URL(item.url);
        const isHome = pathname === "/";
        const isDetail = SITEMAP_DETAIL_PATTERN.test(pathname);
        return {
          ...item,
          lastmod: sitemapLastmod,
          changefreq: isHome ? "daily" : isDetail ? "monthly" : "weekly",
          priority: isHome ? 1.0 : isDetail ? 0.7 : 0.8
        };
      }
    })
  ],
  markdown: {
    shikiConfig: {
      theme: "github-dark-high-contrast"
    }
  }
});
