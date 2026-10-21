export interface ExtraItem {
  slug: string;
  name: string;
  category: "resource" | "swatch" | "starter" | "guide";
  tag: string;
  description: string;
  /** Longer copy, used for the meta description and the page intro. */
  longDescription: string;
  /** Keyword-bearing title for the SERP: `{seoTitle} | KRT store`. */
  seoTitle: string;
  format: string;
  size: string;
  fileType: "pdf" | "zip" | "figma" | "json" | "txt" | "md";
  gradient: string;
  /** Other extras to surface under "More free resources". */
  relatedSlugs: string[];
}

export const extras: ExtraItem[] = [
  {
    slug: "launch-checklist",
    name: "Launch checklist",
    category: "guide",
    tag: "Pre-flight",
    description: "A one-page QA list for shipping production sites without missing the boring things.",
    longDescription:
      "A one-page QA list for shipping production sites without missing the boring things. Covers meta tags, redirects, analytics, error states, image optimisation, and the accessibility checks that are easy to forget on the day of launch.",
    seoTitle: "Free Launch QA Checklist for Production Websites",
    format: "Markdown",
    size: "4 KB",
    fileType: "md",
    gradient: "linear-gradient(135deg, #8ec5fc 0%, #e0c3fc 100%)",
    relatedSlugs: ["writing-prompts", "astro-snippets", "icon-batch-01"]
  },
  {
    slug: "tailwind-color-swatches",
    name: "Tailwind color swatches",
    category: "swatch",
    tag: "Color",
    description: "120 accessible oklch swatches exported as Tailwind config — drop into any project.",
    longDescription:
      "120 accessible oklch swatches exported as a ready-to-paste Tailwind config. Every swatch is checked for WCAG AA contrast against light and dark surfaces, and the file drops straight into an existing tailwind.config.",
    seoTitle: "120 Accessible OKLCH Color Swatches for Tailwind",
    format: "JSON config",
    size: "18 KB",
    fileType: "json",
    gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    relatedSlugs: ["figma-starter", "icon-batch-01", "astro-snippets"]
  },
  {
    slug: "figma-starter",
    name: "Figma starter file",
    category: "starter",
    tag: "Design",
    description: "Empty Figma file with variants, components, and tokens wired up — start designing in minutes.",
    longDescription:
      "An empty Figma file with variants, components, and tokens already wired up. The file ships with a light and a dark style, a documented variable set, and a small component library, so you can start designing in minutes instead of rebuilding the basics.",
    seoTitle: "Free Figma Starter File with Variants & Tokens",
    format: "Figma",
    size: "1 KB link",
    fileType: "figma",
    gradient: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
    relatedSlugs: ["tailwind-color-swatches", "icon-batch-01", "launch-checklist"]
  },
  {
    slug: "astro-snippets",
    name: "Astro snippets pack",
    category: "resource",
    tag: "Snippets",
    description: "25 copy-paste Astro code blocks: layouts, islands, content collections, view transitions.",
    longDescription:
      "25 copy-paste Astro code blocks covering layouts, islands, content collections, and view transitions. Every snippet is a single file you can drop into a project, with a short comment explaining what it does and where it belongs.",
    seoTitle: "Astro Snippets — 25 Layouts, Islands & Code Blocks",
    format: "Astro files",
    size: "12 KB",
    fileType: "zip",
    gradient: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)",
    relatedSlugs: ["launch-checklist", "writing-prompts", "figma-starter"]
  },
  {
    slug: "writing-prompts",
    name: "Writing prompts for engineers",
    category: "guide",
    tag: "Writing",
    description: "70 prompts for shipping better release notes, changelogs, and pull request descriptions.",
    longDescription:
      "70 prompts for shipping better release notes, changelogs, and pull request descriptions. Each prompt is a short question you paste into your editor, aimed at the specific gap that makes engineering writing vague — what changed, who it affects, and why it landed now.",
    seoTitle: "70 Writing Prompts for Engineers — Release Notes & PRs",
    format: "Plain text",
    size: "9 KB",
    fileType: "txt",
    gradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    relatedSlugs: ["launch-checklist", "astro-snippets", "figma-starter"]
  },
  {
    slug: "icon-batch-01",
    name: "Icon batch 01",
    category: "resource",
    tag: "Icons",
    description: "40 hand-drawn SVG icons in a single zipped folder. Free, no attribution required.",
    longDescription:
      "40 hand-drawn SVG icons in a single zipped folder, drawn on a consistent 24px grid with a 2px stroke. Every icon is free to use in personal and commercial work with no attribution required, and comes with the raw SVG and a preview sheet.",
    seoTitle: "Free Icon Pack — 40 Hand-Drawn SVGs",
    format: "SVG set",
    size: "62 KB",
    fileType: "zip",
    gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    relatedSlugs: ["figma-starter", "tailwind-color-swatches", "astro-snippets"]
  }
];

/** Human-readable labels for the extra types, used in headings and schema. */
export const EXTRA_CATEGORY_LABELS: Record<ExtraItem["category"], string> = {
  resource: "Resources",
  swatch: "Color swatches",
  starter: "Starters",
  guide: "Guides"
};
