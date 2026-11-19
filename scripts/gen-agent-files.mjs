// ponytail: generated agent files (llms.txt / llms-full.txt / markdown mirrors of
// product pages) are built from the same catalog data the storefront renders
// from, so the curated map cannot drift from the site. Run from
// `npm run build`; run standalone with `node scripts/gen-agent-files.mjs`.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const storeDir = join(publicDir, "llms", "store");

const siteUrl = (process.env.PUBLIC_SITE_URL || "https://krt.design").replace(/\/+$/, "");

const { products } = await import(pathToFileURL(join(root, "src", "data", "products.ts")).href);

function storeUrl(slug) {
  return `${siteUrl}/store/${slug}/`;
}

function llmsTxt() {
  const lines = [
    "# KRT store",
    "",
    `URL: ${siteUrl}/`,
    "Premium plugins, templates, design systems, icon packs and learning kits for designers and engineers. Free extras: swatches, starters, guides and snippets.",
    "",
    "## Store",
    "",
    `URL: ${siteUrl}/store/`,
    "",
    "## Products",
    "",
  ];
  for (const p of products) {
    lines.push(`### ${p.name} — ${p.tag}`, `URL: ${storeUrl(p.slug)}`, p.description, "");
  }
  return lines.join("\n");
}

function llmsFullTxt() {
  const lines = [
    "# KRT store — full agent-readable text",
    "",
    `URL: ${siteUrl}/`,
    "",
    "## Store",
    "",
    `URL: ${siteUrl}/store/`,
    "",
  ];
  for (const p of products) {
    lines.push(
      `## ${p.name} — ${p.tag}`,
      `URL: ${storeUrl(p.slug)}`,
      `Price: $${p.price}`,
      ...(p.stock ? [`Stock: ${p.stock}`] : []),
      `Version: ${p.version} · File size: ${p.fileSize}`,
      `Compatibility: ${p.compatibility.join(", ")}`,
      "",
      p.longDescription,
      "",
      "### Features",
      "",
      ...p.features.map((f) => `- ${f}`),
      "",
      "### Highlights",
      "",
      ...p.highlights.map((h) => `- ${h.label}: ${h.value}`),
      ""
    );
  }
  return lines.join("\n");
}

function productMarkdown(p) {
  return [
    `# ${p.name} — ${p.tag}`,
    "",
    `- URL: ${storeUrl(p.slug)}`,
    `- Price: $${p.price}`,
    ...(p.stock ? [`- Stock: ${p.stock}`] : []),
    `- Version: ${p.version} · File size: ${p.fileSize}`,
    `- Compatibility: ${p.compatibility.join(", ")}`,
    `- Last updated: ${p.lastUpdated}`,
    "",
    `## Description`,
    "",
    p.longDescription,
    "",
    "## Features",
    "",
    ...p.features.map((f) => `- ${f}`),
    "",
    "## Highlights",
    "",
    ...p.highlights.map((h) => `- ${h.label}: ${h.value}`),
    "",
  ].join("\n");
}

mkdirSync(storeDir, { recursive: true });
writeFileSync(join(publicDir, "llms.txt"), llmsTxt());
writeFileSync(join(publicDir, "llms-full.txt"), llmsFullTxt());
for (const p of products) {
  writeFileSync(join(storeDir, `${p.slug}.md`), productMarkdown(p));
}
console.log(`wrote llms.txt, llms-full.txt and ${products.length} product mirrors to ${publicDir}`);
