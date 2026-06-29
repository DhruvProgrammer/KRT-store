import { useMemo, useState } from "react";
import type { Product } from "../data/products";
import type { Category } from "../data/categories";
import ProductCard from "./ProductCard";

interface ShopFilterProps {
  products: Product[];
  categories: Category[];
}

type SortKey = "featured" | "price-asc" | "price-desc" | "rating";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "rating", label: "Highest rated" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" }
];

export default function ShopFilter({ products, categories }: ShopFilterProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("featured");

  const filtered = useMemo(() => {
    let list = products;
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
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
    else if (sortKey === "rating") sorted.sort((a, b) => b.rating - a.rating);
    return sorted;
  }, [search, activeCategory, sortKey, products]);

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
            onClick={() => {
              setActiveCategory(null);
              setSearch("");
            }}
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
                onClick={() => {
                  setActiveCategory(null);
                  setSearch("");
                }}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-black text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright"
              >
                Reset
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
