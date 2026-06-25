export interface ExtraItem {
  slug: string;
  name: string;
  category: "resource" | "swatch" | "starter" | "guide";
  tag: string;
  description: string;
  format: string;
  size: string;
  fileType: "pdf" | "zip" | "figma" | "json" | "txt" | "md";
  gradient: string;
}

export const extras: ExtraItem[] = [
  {
    slug: "launch-checklist",
    name: "Launch checklist",
    category: "guide",
    tag: "Pre-flight",
    description: "A one-page QA list for shipping production sites without missing the boring things.",
    format: "Markdown",
    size: "4 KB",
    fileType: "md",
    gradient: "linear-gradient(135deg, #8ec5fc 0%, #e0c3fc 100%)"
  },
  {
    slug: "tailwind-color-swatches",
    name: "Tailwind color swatches",
    category: "swatch",
    tag: "Color",
    description: "120 accessible oklch swatches exported as Tailwind config — drop into any project.",
    format: "JSON config",
    size: "18 KB",
    fileType: "json",
    gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)"
  },
  {
    slug: "figma-starter",
    name: "Figma starter file",
    category: "starter",
    tag: "Design",
    description: "Empty Figma file with variants, components, and tokens wired up — start designing in minutes.",
    format: "Figma",
    size: "1 KB link",
    fileType: "figma",
    gradient: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)"
  },
  {
    slug: "astro-snippets",
    name: "Astro snippets pack",
    category: "resource",
    tag: "Snippets",
    description: "25 copy-paste Astro code blocks: layouts, islands, content collections, view transitions.",
    format: "Astro files",
    size: "12 KB",
    fileType: "zip",
    gradient: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)"
  },
  {
    slug: "writing-prompts",
    name: "Writing prompts for engineers",
    category: "guide",
    tag: "Writing",
    description: "70 prompts for shipping better release notes, changelogs, and pull request descriptions.",
    format: "Plain text",
    size: "9 KB",
    fileType: "txt",
    gradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)"
  },
  {
    slug: "icon-batch-01",
    name: "Icon batch 01",
    category: "resource",
    tag: "Icons",
    description: "40 hand-drawn SVG icons in a single zipped folder. Free, no attribution required.",
    format: "SVG set",
    size: "62 KB",
    fileType: "zip",
    gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
  }
];
