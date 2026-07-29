import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// IMPORTANT: Update the `site` below to your real production domain before
// deploying (e.g. "https://krt.design" or "https://your-store.com").
// The value is used to build canonical URLs, Open Graph absolute URLs,
// and the sitemap.xml location.

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

export default defineConfig({
  site: "https://design-goods.example.com",
  integrations: [
    react(),
    tailwind(),
    sitemap({
      filter: (page) =>
        !/\/(login|signup|profile|settings|checkout)(\/|$)/.test(page)
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
