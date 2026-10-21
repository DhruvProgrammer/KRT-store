// Shared helpers for building search snippets. One place, so every page
// produces a description the same way.

/**
 * Build a meta description from a long body of copy.
 *
 * Prefers whole sentences (a truncated sentence reads badly in a SERP), and
 * only falls back to a word-boundary cut when the first sentence is very
 * short. Capped at ~157 chars, which is where Google starts truncating.
 */
export function metaDescription(text: string, max = 157): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > max) break;
    out = (out + sentence).trim();
  }
  if (out.length >= 100) return out;

  const cut = clean.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return (at > 60 ? cut.slice(0, at) : cut).trim() + "…";
}

/** The brand suffix used on every page title. */
export const BRAND = "KRT store";

/** `{keyword} | KRT store` — the pattern for content pages. */
export function pageTitle(keyword: string): string {
  return `${keyword} | ${BRAND}`;
}
