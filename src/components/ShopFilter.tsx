import { useEffect, useMemo, useState } from "react";
import type { Product } from "../data/products";
import type { Category } from "../data/categories";
import ProductCard from "./ProductCard";

interface ShopFilterProps {
  products: Product[];
  categories: Category[];
}

// ponytail: the "Highest rated" sort was removed with the fabricated ratings.
// The list is no longer a ranking by review count, and a sort that promises
// a ranking the data does not support is worse than no sort at all.
type SortKey = "featured" | "price-asc" | "price-desc";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" }
];

export default function ShopFilter({ products, categories }: ShopFilterProps) {
  // ponytail: the state is seeded from the URL so the search results and the
  // category filter are LINKABLE, and so the SearchAction in the WebSite
  // schema (target /store?q=...) actually works. It used to point at a
  // parameter nothing read, so every ?q= URL was a dead end.
  //
  // The URL is read in an effect, NOT in the useState initialiser: the server
  // has no window, so an initialiser that reads window.location makes the
  // server-rendered HTML disagree with the first client render and React
  // throws a hydration mismatch (error #418).
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("featured");
  const [hydrated, setHydrated] = useState(false);

  // Adopt the incoming deep link after mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("q") ?? "");
    setActiveCategory(params.get("category"));
    setHydrated(true);
  }, []);

  // Mirror the state back to the URL so the current view can be shared.
  // Gated on `hydrated`, otherwise this effect would immediately erase the
  // deep link the mount effect just read.
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (activeCategory) params.set("category", activeCategory);
    const query = params.toString();
    const url = query ? `/store/?${query}` : "/store/";
    window.history.replaceState(null, "", url);
  }, [search, activeCategory, hydrated]);

  const filtered = useMemo(() => {
    let list = products;
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.longDescription.toLowerCase().includes(q) ||
          p.tag.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    if (activeCategory) {
      list = list.filter((p) => p.category === activeCategory);
    }

    const sorted = [...list];
    if (sortKey === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sortKey === "price-desc") sorted.sort((a, b) => b.price - a.price);
    return sorted;
  }, [search, activeCategory, sortKey, products]);

  // ponytail: the listing page used to be ONE flat grid with no <h2> at all —
  // so the two pages that should own the head terms ("design plugins", "UI
  // kits") had a single keyword-free heading. Grouping by category adds five
  // keyword-bearing H2 sections and puts the category copy (which was already
  // in the data model but never rendered) to work.
  const groups = useMemo(() => {
    const byCategory = new Map<string, Product[]>();
    for (const product of filtered) {
      const bucket = byCategory.get(product.category) ?? [];
      bucket.push(product);
      byCategory.set(product.category, bucket);
    }
    return categories
      .filter((c) => byCategory.has(c.slug))
      .map((c) => ({ category: c, items: byCategory.get(c.slug) ?? [] }));
  }, [filtered, categories]);

  const reset = () => {
    setActiveCategory(null);
    setSearch("");
  };

  return (
    <section className="container mx-auto px-4 pb-20 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-8 lg:sticky lg:top-32 lg:self-start">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-ink-muted">
              Search store
            </p>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plugins, templates…"
              className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
              aria-label="Search store"
            />
          </div>

          <fieldset>
            <legend className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-ink-muted">
              Categories
            </legend>
            <div className="flex flex-col gap-2">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-ink-muted transition hover:bg-surface/40">
                <input
                  type="radio"
                  name="category"
                  checked={activeCategory === null}
                  onChange={() => setActiveCategory(null)}
                  className="h-5 w-5 cursor-pointer border-line bg-surface text-accent focus:ring-accent"
                />
                <span className="flex-1">All categories</span>
                <span className="text-[11px] font-bold text-ink-muted">{products.length}</span>
              </label>
              {categories.map((c) => {
                const count = products.filter((p) => p.category === c.slug).length;
                const isActive = activeCategory === c.slug;
                return (
                  <label key={c.slug} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-ink-muted transition hover:bg-surface/40">
                    <input
                      type="radio"
                      name="category"
                      checked={isActive}
                      onChange={() => setActiveCategory(c.slug)}
                      className="h-5 w-5 cursor-pointer border-line bg-surface text-accent focus:ring-accent"
                    />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-[11px] font-bold text-ink-muted">{count}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-black uppercase tracking-[0.2em] text-ink-muted transition hover:text-accent"
          >
            Reset
          </button>
        </aside>

        <div>
          <div className="mb-6 flex flex-col gap-3 border border-line bg-surface/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:px-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </p>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="font-black uppercase tracking-[0.18em]">Sort by</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-full border border-line bg-surface-ink px-3 py-1.5 text-xs font-bold text-ink outline-none focus:border-accent"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-line bg-surface/70 p-12 text-center">
              <p className="text-lg font-black text-ink">No products match these filters.</p>
              <p className="mt-2 text-sm text-ink-muted">
                Try removing a search term or selecting a different category.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-black text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright"
              >
                Reset
              </button>
            </div>
          ) : (
            <div className="space-y-12">
              {groups.map(({ category, items }) => (
                <section key={category.slug} aria-labelledby={`cat-${category.slug}`}>
                  <div className="mb-5 border-b border-line pb-4">
                    <h2
                      id={`cat-${category.slug}`}
                      className="text-2xl font-black tracking-[-0.04em] text-ink sm:text-3xl"
                    >
                      {category.name}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-muted">
                      {category.tagline}. {category.description}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((product) => (
                      <ProductCard key={product.slug} product={product} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
