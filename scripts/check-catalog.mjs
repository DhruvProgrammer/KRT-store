// ponytail: the ORDER and PAYMENT services price the order from the CATALOG
// service, so a product the storefront sells but the catalogue does not know
// cannot be bought at all -- the checkout answers "Unknown product". That
// happened: three storefront products (Editor Shield, Dash UI Kit, Trailhead)
// were missing from the catalogue, so they were unbuyable.
//
// A comment cannot keep two price lists in sync. Only an assertion can.
//
//   node scripts/check-catalog.mjs
//
// It fails when the two lists disagree on a slug, on a price, or when the
// catalogue has a product the storefront does not sell.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

// slug -> price, for a list of `slug: "x"` / `price: 12` pairs. The price
// that follows a slug belongs to it: both files list the slug before the
// price inside the same object literal.
function parse(source) {
  const pairs = new Map();
  const pattern = /slug:\s*["']([^"']+)["']([\s\S]*?)(?=\n\s{2,4}\},|\n\];)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const slug = match[1];
    const block = match[2];
    const price = /price:\s*(\d+(?:\.\d+)?)/.exec(block);
    if (price) pairs.set(slug, Number(price[1]));
  }
  return pairs;
}

const storefront = parse(
  readFileSync(join(root, "src", "data", "products.ts"), "utf8")
);
const catalogue = parse(
  readFileSync(join(root, "services", "catalog-service", "index.js"), "utf8")
);

console.log("Catalogue / storefront price check");

check("the storefront list parsed", () => {
  if (storefront.size < 10) {
    throw new Error(`only parsed ${storefront.size} storefront products -- the parser broke`);
  }
});
check("the catalogue list parsed", () => {
  if (catalogue.size < 10) {
    throw new Error(`only parsed ${catalogue.size} catalogue products -- the parser broke`);
  }
});

check("every storefront product is in the catalogue", () => {
  const missing = [...storefront.keys()].filter((slug) => !catalogue.has(slug));
  if (missing.length) {
    throw new Error(
      `these storefront products are not in the catalogue and cannot be bought: ${missing.join(", ")}`
    );
  }
});

check("the catalogue has no product the storefront does not sell", () => {
  const extra = [...catalogue.keys()].filter((slug) => !storefront.has(slug));
  if (extra.length) {
    throw new Error(`the catalogue sells products the storefront does not list: ${extra.join(", ")}`);
  }
});

check("every price matches", () => {
  const wrong = [];
  for (const [slug, price] of storefront) {
    const cataloguePrice = catalogue.get(slug);
    if (cataloguePrice !== undefined && cataloguePrice !== price) {
      wrong.push(`${slug}: storefront ${price} vs catalogue ${cataloguePrice}`);
    }
  }
  if (wrong.length) throw new Error(wrong.join("; "));
});

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${storefront.size} products match.`);
