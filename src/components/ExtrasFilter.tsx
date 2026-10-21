import { useEffect, useMemo, useState } from "react";
import type { ExtraItem } from "../data/extras";
import { EXTRA_CATEGORY_LABELS } from "../data/extras";
import ExtraCard from "./ExtraCard";

interface ExtrasFilterProps {
  items: ExtraItem[];
}

export default function ExtrasFilter({ items }: ExtrasFilterProps) {
  // ponytail: seeded from the URL so the free-extras filter is linkable (same
  // reason as ShopFilter). The URL is read in an effect, not in the useState
  // initialiser -- the server has no window, so an initialiser that reads
  // window.location causes a hydration mismatch (React error #418).
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, [items]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("q") ?? "");
    setActiveCategory(params.get("category"));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (activeCategory) params.set("category", activeCategory);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/extras/?${query}` : "/extras/");
  }, [search, activeCategory, hydrated]);

  const filtered = useMemo(() => {
    let list = items;
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.longDescription.toLowerCase().includes(q) ||
          e.tag.toLowerCase().includes(q)
      );
    }
    if (activeCategory) {
      list = list.filter((e) => e.category === activeCategory);
    }
    return list;
  }, [search, activeCategory, items]);

  // ponytail: the listing page had no <h2> at all. Grouping by type adds
  // four keyword-bearing H2 sections (free swatches, free icons, free
  // starters, free guides) to the page most likely to rank for "free design
  // resources".
  const groups = useMemo(() => {
    const byCategory = new Map<string, ExtraItem[]>();
    for (const item of filtered) {
      const bucket = byCategory.get(item.category) ?? [];
      bucket.push(item);
      byCategory.set(item.category, bucket);
    }
    return categories
      .filter((c) => byCategory.has(c))
      .map((c) => ({ category: c, items: byCategory.get(c) ?? [] }));
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
              Search extras
            </p>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search free downloads…"
              className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
              aria-label="Search extras"
            />
          </div>

          <fieldset>
            <legend className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-ink-muted">
              Type
            </legend>
            <div className="flex flex-col gap-2">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-ink-muted transition hover:bg-surface/40">
                <input
                  type="radio"
                  name="extras-category"
                  checked={activeCategory === null}
                  onChange={() => setActiveCategory(null)}
                  className="h-5 w-5 cursor-pointer border-line bg-surface text-accent focus:ring-accent"
                />
                <span className="flex-1">All types</span>
                <span className="text-[11px] font-bold text-ink-muted">{items.length}</span>
              </label>
              {categories.map((cat) => {
                const count = items.filter((e) => e.category === cat).length;
                const isActive = activeCategory === cat;
                return (
                  <label
                    key={cat}
                    className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 text-sm text-ink-muted transition hover:bg-surface/40"
                  >
                    <input
                      type="radio"
                      name="extras-category"
                      checked={isActive}
                      onChange={() => setActiveCategory(cat)}
                      className="h-5 w-5 cursor-pointer border-line bg-surface text-accent focus:ring-accent"
                    />
                    <span className="flex-1">{EXTRA_CATEGORY_LABELS[cat as keyof typeof EXTRA_CATEGORY_LABELS] ?? cat}</span>
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
          <div className="mb-6 flex items-center justify-between rounded-full border border-line bg-surface/60 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
            <p>
              {filtered.length} {filtered.length === 1 ? "download" : "downloads"}
            </p>
            <span>Always free</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-line bg-surface/70 p-12 text-center">
              <p className="text-lg font-black text-ink">No extras match these filters.</p>
              <p className="mt-2 text-sm text-ink-muted">
                Try a different word or remove a filter.
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
              {groups.map(({ category, items: groupItems }) => (
                <section
                  key={category}
                  aria-labelledby={`extra-${category}`}
                >
                  <div className="mb-5 border-b border-line pb-4">
                    <h2
                      id={`extra-${category}`}
                      className="text-2xl font-black tracking-[-0.04em] text-ink sm:text-3xl"
                    >
                      Free {EXTRA_CATEGORY_LABELS[category as keyof typeof EXTRA_CATEGORY_LABELS] ?? category}
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {groupItems.map((item) => (
                      <ExtraCard key={item.slug} item={item} />
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
