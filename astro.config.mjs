import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  /*
    IMPORTANT: Update this to your real production domain before deploying:
    e.g., "https://krt.design" or "https://your-store.com"
  */
  site: "https://design-goods.example.com",
  integrations: [react(), tailwind(), sitemap()],
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
