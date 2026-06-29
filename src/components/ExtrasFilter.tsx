import { useMemo, useState } from "react";
import type { ExtraItem } from "../data/extras";
import ExtraCard from "./ExtraCard";

interface ExtrasFilterProps {
  items: ExtraItem[];
}

export default function ExtrasFilter({ items }: ExtrasFilterProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, [items]);

  const labelFor: Record<string, string> = {
    resource: "Resources",
    swatch: "Swatches",
    starter: "Starters",
    guide: "Guides"
  };

  const filtered = useMemo(() => {
    let list = items;
    const q = search.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tag.toLowerCase().includes(q)
      );
    }
    if (activeCategory) {
      list = list.filter((e) => e.category === activeCategory);
    }
    return list;
  }, [search, activeCategory, items]);

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
                    <span className="flex-1">{labelFor[cat] ?? cat}</span>
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
              {filtered.map((item) => (
                <ExtraCard key={item.slug} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
