import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// The production domain. Overridable with PUBLIC_SITE_URL (deploy env); the
// default keeps `npm run dev` working with no setup at all.
const DEFAULT_SITE_URL = "https://krt.design";

// ponytail: fail the build if PUBLIC_API_URL is missing or insecure. Catches
// the "http://localhost:3001 leaked into production" footgun — that URL hits
// the visitor's own machine (or a DNS-hijacked resolver), and the previous
// build silently shipped it because the fallback `|| "http://localhost:3001"`
// in AuthForm/CheckoutForm masked the missing env var on Netlify.
const isBuildCommand = process.argv.includes("build");
if (isBuildCommand) {
  const apiUrl = process.env.PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error(
      "PUBLIC_API_URL is not set. Set it in .env (dev) or in the Netlify deploy env (prod). " +
      "Example: PUBLIC_API_URL=https://api.example.com"
    );
  }
  if (apiUrl.includes("localhost") || apiUrl.startsWith("http://")) {
    throw new Error(
      `PUBLIC_API_URL is insecure ("${apiUrl}"). Production must be https:// and must not be localhost.`
    );
  }
}

// ponytail: the site URL is baked into EVERY canonical, og:url, JSON-LD
// `url`/`logo`/`offers.url` and the sitemap. Shipping the IANA placeholder
// (example.com — a domain that will never resolve) is a total de-index, so
// the build refuses a missing / non-https / localhost / placeholder value
// instead of quietly shipping a wrong domain.
const rawSiteUrl = process.env.PUBLIC_SITE_URL;
const siteUrl = (rawSiteUrl || DEFAULT_SITE_URL).replace(/\/+$/, "");
if (isBuildCommand) {
  if (!rawSiteUrl) {
    throw new Error(
      "PUBLIC_SITE_URL is not set. Set it in the shell/CI env or in the Netlify deploy env (prod). " +
      "(Astro evaluates this config BEFORE loading .env, so a .env entry alone will not do.) " +
      "Example: PUBLIC_SITE_URL=https://krt.design"
    );
  }
  if (!rawSiteUrl.startsWith("https://")) {
    throw new Error(`PUBLIC_SITE_URL must use https:// ("${rawSiteUrl}").`);
  }
  if (rawSiteUrl.includes("localhost")) {
    throw new Error(
      `PUBLIC_SITE_URL is insecure ("${rawSiteUrl}"). Production must be https:// and must not be localhost.`
    );
  }
  if (/example\.com|your-store/i.test(rawSiteUrl)) {
    throw new Error(
      `PUBLIC_SITE_URL is still a placeholder ("${rawSiteUrl}"). Set the real production domain.`
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
  // ponytail: "always", not "ignore", so the dev server, the build and the
  // canonicals agree on ONE url shape. With "ignore" the dev server happily
  // serves "/store" while handing the page a canonical of "/store/" — the
  // canonical then points at a url the same dev server only serves after a
  // redirect. "always" makes the dev server 404 the non-canonical shape
  // instead of hiding it, which is what caught the extensionless links.
  //
  // The built artefact is byte-identical under either value (the canonical is
  // derived from the route path, so it is "/store/" either way, and the
  // sitemap adds the slash for the directory build format) — verified, 59/59
  // assertions green under both. "always" is kept because it is the stricter
  // guardrail: Netlify 301s "/store" to "/store/" in production, so a stray
  // external link works in production but must not 404 in local preview.
  //
  // NOTE: every internal href must therefore carry its trailing slash.
  trailingSlash: "always",
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
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            motion: ["framer-motion"]
          }
        }
      }
    }
  }
});
