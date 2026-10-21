import type { APIRoute } from "astro";

// ponytail: robots.txt is an ENDPOINT, not a static file. A static
// public/robots.txt can only hardcode the domain (which is exactly how
// https://design-goods.example.com leaked into production) and it would
// also collide with this route over dist/robots.txt.
//
// Nothing is Disallowed here, on purpose. `Disallow` stops the crawler
// BEFORE it fetches the page, so the crawler can never read the page-level
// <meta name="robots" content="noindex"> — that yields the Search Console
// state "Indexed, though blocked by robots.txt": a bare URL in the index with
// no title and no snippet. De-indexing is done per page with the `noindex`
// prop on BaseLayout instead.
export const GET: APIRoute = ({ site }) => {
  // import.meta.env.SITE is populated from the `site` option in
  // astro.config.mjs, so this can never drift from the canonicals.
  const base = (import.meta.env.SITE || site?.href || "").replace(/\/+$/, "");
  const body = ["User-agent: *", "Allow: /", "", `Sitemap: ${base}/sitemap-index.xml`, ""].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
};
