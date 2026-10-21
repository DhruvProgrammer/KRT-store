export interface Category {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Human-readable label, used in headings and in the Product schema. */
  label: string;
}

export const categories: Category[] = [
  {
    slug: "plugins",
    name: "Plugins",
    label: "Plugins",
    tagline: "Drop-in power-ups",
    description: "Figma, Editor, and browser plugins that remove friction from interface work."
  },
  {
    slug: "templates",
    name: "Templates",
    label: "Templates",
    tagline: "Editorial layouts",
    description: "Ready-made Astro, Next.js, and CMS templates tuned for long-form reading and product pages."
  },
  {
    slug: "design-systems",
    name: "Design systems",
    label: "Design systems",
    tagline: "Tokens and primitives",
    description: "Token packs, primitives, and themed components that establish a premium visual language."
  },
  {
    slug: "icon-packs",
    name: "Icon packs",
    label: "Icon packs",
    tagline: "Mono SVG kits",
    description: "Hand-crafted monotone icon families for UI, dashboards, and marketing surfaces."
  },
  {
    slug: "learning",
    name: "Learning kits",
    label: "Learning kits",
    tagline: "Guides and playbooks",
    description: "Video courses, checklists, and reference notebooks for product engineers and designers."
  }
];

export function categoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}
