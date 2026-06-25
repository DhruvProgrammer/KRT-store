export interface Product {
  slug: string;
  name: string;
  category: string;
  tag: string;
  description: string;
  longDescription: string;
  price: number;
  features: string[];
  compatibility: string[];
  version: string;
  fileSize: string;
  gradient: string;
  highlights: { label: string; value: string }[];
  rating: number;
  reviewCount: number;
}

export const products: Product[] = [
  {
    slug: "clarity-plugin",
    name: "Clarity",
    category: "plugins",
    tag: "Accessibility",
    description: "One-click accessibility audits for live URLs and design files.",
    longDescription: "Clarity is a browser and Figma plugin that scans your design or live site for contrast failures, missing focus indicators, and motion issues. It runs Lighthouse-based rules without leaving your workflow and exports a shareable audit report in seconds.",
    price: 24,
    features: [
      "One-click contrast and focus audits",
      "Live URL scanning",
      "Lighthouse rule coverage",
      "Exportable audit report"
    ],
    compatibility: ["Figma 13+", "Chrome 119+", "Web"],
    version: "v1.4.2",
    fileSize: "2.3 MB",
    gradient: "linear-gradient(135deg, #dfe4ea 0%, #9aa1ab 100%)",
    highlights: [
      { label: "Rules", value: "92" },
      { label: "Avg scan", value: "<4s" },
      { label: "Platforms", value: "3" }
    ]
  ,
  rating: 4.8,
  reviewCount: 232
},
  {
    slug: "pivot-extension",
    name: "Pivot",
    category: "plugins",
    tag: "Editor tool",
    description: "Jump between files, symbols, and references without leaving the keyboard.",
    longDescription: "Pivot is a VS Code extension that gives you command-palette speed for navigating large codebases. Search by symbol, jump to references, and switch between related files with a single keystroke.",
    price: 19,
    features: [
      "Fuzzy symbol search",
      "Cross-file reference jump",
      "Related file switching",
      "Zero-config setup"
    ],
    compatibility: ["VS Code 1.85+", "Web"],
    version: "v2.0.1",
    fileSize: "1.1 MB",
    gradient: "linear-gradient(135deg, #c8d0db 0%, #7c8694 100%)",
    highlights: [
      { label: "Commands", value: "14" },
      { label: "Latency", value: "<12ms" },
      { label: "Rating", value: "4.9" }
    ]
  ,
  rating: 4.7,
  reviewCount: 184
},
  {
    slug: "composer-plugin",
    name: "Composer",
    category: "plugins",
    tag: "Workflow",
    description: "Generate Tailwind CSS component files from design tokens automatically.",
    longDescription: "Composer reads your design token JSON and produces ready-to-use Tailwind CSS component files with variants, responsive props, and dark-mode classes baked in. Stop writing repetitive utility classes by hand.",
    price: 29,
    features: [
      "Token-to-component generation",
      "Dark-mode variant support",
      "Responsive breakpoint props",
      "Plugin API for custom transforms"
    ],
    compatibility: ["Tailwind 3.4+", "Node 18+", "CLI"],
    version: "v1.1.0",
    fileSize: "3.8 MB",
    gradient: "linear-gradient(135deg, #b0b8c4 0%, #636e7e 100%)",
    highlights: [
      { label: "Templates", value: "28" },
      { label: "Build time", value: "<0.5s" },
      { label: "Transfers", value: "2.1k" }
    ]
  ,
  rating: 4.6,
  reviewCount: 96
},
  {
    slug: "atlas-template",
    name: "Atlas",
    category: "templates",
    tag: "Blog starter",
    description: "An Astro blog template with editorial rhythm and zero config.",
    longDescription: "Atlas is a production-ready Astro blog built for long-form reading. It ships with calm typography, table-of-contents generation, RSS, and dark mode by default. Deploy to Vercel or Netlify in under a minute.",
    price: 39,
    features: [
      "Editorial long-form layout",
      "Auto table of contents",
      "RSS and sitemap included",
      "One-command deploy"
    ],
    compatibility: ["Astro 5+", "Vercel", "Netlify"],
    version: "v3.2.0",
    fileSize: "4.6 MB",
    gradient: "linear-gradient(135deg, #a3adb8 0%, #545d6c 100%)",
    highlights: [
      { label: "Lighthouse", value: "98" },
      { label: "Pages", value: "6" },
      { label: "Fonts", value: "0" }
    ]
  ,
  rating: 4.9,
  reviewCount: 312
},
  {
    slug: "arcwise-template",
    name: "Arcwise",
    category: "templates",
    tag: "SaaS starter",
    description: "A Next.js SaaS landing template with pricing, auth, and payments.",
    longDescription: "Arcwise gives you a complete SaaS landing page out of the box: pricing tables, Stripe checkout, Supabase auth, and a responsive dashboard shell. Built with Tailwind, Framer Motion, and TypeScript.",
    price: 59,
    features: [
      "Pricing comparison table",
      "Stripe checkout integration",
      "Supabase auth flow",
      "Dashboard layout shell"
    ],
    compatibility: ["Next.js 14+", "Supabase", "Stripe"],
    version: "v2.1.3",
    fileSize: "8.2 MB",
    gradient: "linear-gradient(135deg, #8e99a8 0%, #3d4654 100%)",
    highlights: [
      { label: "Components", value: "42" },
      { label: "Auth", value: "Built-in" },
      { label: "Payments", value: "Stripe" }
    ]
  ,
  rating: 4.8,
  reviewCount: 248
},
  {
    slug: "calm-tokens",
    name: "Calm Tokens",
    category: "design-systems",
    tag: "Token pack",
    description: "A neutral gray design token set for premium dark-mode interfaces.",
    longDescription: "Calm Tokens is a curated set of 120 design tokens covering color, spacing, typography, and elevation. Optimised for dark-mode reading interfaces with WCAG AA contrast ratios across every surface.",
    price: 34,
    features: [
      "120 semantic tokens",
      "WCAG AA contrast verified",
      "Figma variables export",
      "Tailwind and CSS output"
    ],
    compatibility: ["Figma", "Tailwind 3+", "CSS"],
    version: "v2.4.0",
    fileSize: "0.8 MB",
    gradient: "linear-gradient(135deg, #95a0ae 0%, #4a5568 100%)",
    highlights: [
      { label: "Tokens", value: "120" },
      { label: "Themes", value: "2" },
      { label: "Format", value: "JSON" }
    ]
  ,
  rating: 4.6,
  reviewCount: 74
},
  {
    slug: "frontline-ui",
    name: "Frontline UI",
    category: "design-systems",
    tag: "Component library",
    description: "React components with glass surfaces, motion, and Gumroad-style actions.",
    longDescription: "Frontline UI is a React component library built on Tailwind and Framer Motion. It provides glass cards, reveal animations, pill buttons, and editorial prose layouts that match the aesthetic of premium developer-education sites.",
    price: 49,
    features: [
      "28 production components",
      "Framer Motion animations",
      "Gumroad-style button variants",
      "Accessible by default"
    ],
    compatibility: ["React 19+", "Tailwind 3+", "Astro"],
    version: "v1.8.1",
    fileSize: "5.4 MB",
    gradient: "linear-gradient(135deg, #7e8a99 0%, #2d3748 100%)",
    highlights: [
      { label: "Components", value: "28" },
      { label: "Bundle", value: "14kb" },
      { label: "A11y", value: "AA" }
    ]
  ,
  rating: 4.7,
  reviewCount: 162
},
  {
    slug: "monochrome-icons",
    name: "Monochrome",
    category: "icon-packs",
    tag: "Icon family",
    description: "320 monotone SVG icons for UI, dashboards, and marketing pages.",
    longDescription: "Monochrome delivers 320 carefully drawn SVG icons in three weights — light, regular, bold — with a consistent 24px grid. Every icon is optimised for dark-mode surfaces and ships with React, Vue, and raw SVG exports.",
    price: 29,
    features: [
      "320 icons in 3 weights",
      "24px grid, 2px stroke",
      "React, Vue, and SVG formats",
      "Figma component library"
    ],
    compatibility: ["React", "Vue", "Figma", "SVG"],
    version: "v3.0.0",
    fileSize: "1.6 MB",
    gradient: "linear-gradient(135deg, #b8bfca 0%, #6b7280 100%)",
    highlights: [
      { label: "Icons", value: "320" },
      { label: "Weights", value: "3" },
      { label: "Formats", value: "4" }
    ]
  ,
  rating: 4.9,
  reviewCount: 412
},
  {
    slug: "open-lesson-kit",
    name: "Open Lesson Kit",
    category: "learning",
    tag: "Course starter",
    description: "An Astro course template with video embeds, progress, and quizzes.",
    longDescription: "Open Lesson Kit is a fully functional course platform built with Astro and React. It includes video lesson pages, progress tracking, markdown quiz blocks, and a clean reading experience. Deploy once and start teaching.",
    price: 44,
    features: [
      "Video lesson pages",
      "Progress tracking with localStorage",
      "Markdown quiz blocks",
      "Certificate generation"
    ],
    compatibility: ["Astro 5+", "React", "Vercel"],
    version: "v1.5.0",
    fileSize: "6.1 MB",
    gradient: "linear-gradient(135deg, #a0aab5 0%, #4b5563 100%)",
    highlights: [
      { label: "Lessons", value: "Unlimited" },
      { label: "Quizzes", value: "Yes" },
      { label: "Lighthouse", value: "97" }
    ]
  ,
  rating: 4.5,
  reviewCount: 56
},
  {
    slug: "editor-shield",
    name: "Editor Shield",
    category: "plugins",
    tag: "Content safety",
    description: "Auto-save, version snapshots, and offline recovery for browser editors.",
    longDescription: "Editor Shield is a lightweight browser plugin that adds auto-save, version snapshots, and offline recovery to any contenteditable field, CMS editor, or web-based writing tool. Never lose a draft again.",
    price: 18,
    features: [
      "Auto-save every 30 seconds",
      "Version snapshots with diff",
      "Offline recovery",
      "Works on any contenteditable"
    ],
    compatibility: ["Chrome 119+", "Firefox 125+", "Safari 17+"],
    version: "v1.2.4",
    fileSize: "0.9 MB",
    gradient: "linear-gradient(135deg, #c4cbd5 0%, #8a929e 100%)",
    highlights: [
      { label: "Saves", value: "Auto" },
      { label: "Recovery", value: "Offline" },
      { label: "Editors", value: "All" }
    ]
  ,
  rating: 4.6,
  reviewCount: 88
},
  {
    slug: "dash-ui-kit",
    name: "Dash UI Kit",
    category: "design-systems",
    tag: "Dashboard system",
    description: "A complete dashboard design system with charts, tables, and sidebars.",
    longDescription: "Dash UI Kit provides every piece you need to build a calm, data-rich dashboard: chart wrappers, data tables, filter controls, sidebar navigation, and detail drawers. Built for React with Tailwind and Framer Motion.",
    price: 54,
    features: [
      "Chart components (bar, line, pie)",
      "Sortable data tables",
      "Sidebar and drawer layout",
      "Responsive mobile shell"
    ],
    compatibility: ["React 19+", "Tailwind 3+", "Recharts"],
    version: "v2.3.0",
    fileSize: "7.2 MB",
    gradient: "linear-gradient(135deg, #8b95a2 0%, #374151 100%)",
    highlights: [
      { label: "Components", value: "36" },
      { label: "Charts", value: "6" },
      { label: "Layouts", value: "4" }
    ]
  ,
  rating: 4.8,
  reviewCount: 198
},
  {
    slug: "trailhead-template",
    name: "Trailhead",
    category: "templates",
    tag: "Release notes",
    description: "A change-log and release-notes template with RSS and categories.",
    longDescription: "Trailhead is a minimal Astro template for publishing product changelogs and release notes. It includes category filters, RSS, search, and a clean editorial layout that integrates with any product site.",
    price: 29,
    features: [
      "Category-based filters",
      "Full-text client search",
      "RSS feed included",
      "Embeddable widget script"
    ],
    compatibility: ["Astro 5+", "Netlify", "Vercel"],
    version: "v1.0.2",
    fileSize: "2.8 MB",
    gradient: "linear-gradient(135deg, #b3bac3 0%, #5c6370 100%)",
    highlights: [
      { label: "Speed", value: "Instant" },
      { label: "RSS", value: "Yes" },
      { label: "Search", value: "Client" }
    ]
  ,
  rating: 4.5,
  reviewCount: 42
}
];

export const productBySlug = (slug: string) => products.find((p) => p.slug === slug);

export const productsByCategory = (category: string) => products.filter((p) => p.category === category);
