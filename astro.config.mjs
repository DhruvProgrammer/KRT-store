import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// IMPORTANT: Update the `site` below to your real production domain before
// deploying (e.g. "https://krt.design" or "https://your-store.com").
// The value is used to build canonical URLs, Open Graph absolute URLs,
// and the sitemap.xml location.
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
