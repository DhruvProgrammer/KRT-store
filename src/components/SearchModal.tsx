import { useEffect, useState } from "react";

export interface SearchProduct {
  slug: string;
  name: string;
  description: string;
  tag: string;
  category: string;
}

export interface SearchExtra {
  slug: string;
  name: string;
  description: string;
  tag: string;
  category: string;
}

interface SearchModalProps {
  products?: SearchProduct[];
  extras?: SearchExtra[];
}

type Result =
  | { kind: "store"; slug: string; name: string; description: string; tag: string }
  | { kind: "extras"; slug: string; name: string; description: string; tag: string };

export default function SearchModal({
  products = [],
  extras = []
}: SearchModalProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("krt:open-search", openHandler);
    return () => window.removeEventListener("krt:open-search", openHandler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const close = () => setOpen(false);

  const q = query.trim().toLowerCase();
  const results: Result[] = [];
  if (q.length > 0) {
    for (const p of products) {
      if (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      ) {
        results.push({ kind: "store", slug: p.slug, name: p.name, description: p.description, tag: p.tag });
      }
    }
    for (const e of extras) {
      if (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tag.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      ) {
        results.push({ kind: "extras", slug: e.slug, name: e.name, description: e.description, tag: e.tag });
      }
    }
  }

  const storeResults = results.filter((r): r is Extract<Result, { kind: "store" }> => r.kind === "store");
  const extrasResults = results.filter((r): r is Extract<Result, { kind: "extras" }> => r.kind === "extras");

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={close}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-x-0 top-0 z-50 max-h-[100dvh] origin-top overflow-y-auto overscroll-contain border-b border-line bg-bg-soft/95 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform ${
          open ? "translate-y-0" : "-translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Search products"
        aria-hidden={!open}
      >
        <div className="container mx-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-5 shadow-soft focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-ink-muted">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plugins, templates, free extras…"
              className="h-12 flex-1 bg-transparent text-base text-ink placeholder-ink-muted outline-none"
              aria-label="Search"
            />
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-ink text-ink transition hover:bg-surface-bright"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {q.length === 0 ? (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-ink-muted">Quick links</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <a href="/store" onClick={close} className="text-ink transition hover:text-accent">
                      Browse the store →
                    </a>
                  </li>
                  <li>
                    <a href="/extras" onClick={close} className="text-ink transition hover:text-accent">
                      Browse free extras →
                    </a>
                  </li>
                  <li>
                    <a href="/cart" onClick={close} className="text-ink transition hover:text-accent">
                      View cart →
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-ink-muted">Tips</p>
                <p className="mt-3 text-sm text-ink-muted">
                  Type a tool name, category, or tag. Includes store products and free extras.
                </p>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="mt-8 text-center">
              <p className="text-sm text-ink-muted">
                No results for <span className="font-black text-ink">"{query}"</span>. Try a different word.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              {storeResults.length > 0 && (
                <section>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-accent">
                    Store · {storeResults.length} results
                  </p>
                  <ul className="mt-3 space-y-2">
                    {storeResults.map((r) => (
                      <li key={`store-${r.slug}`}>
                        <a
                          href={`/store/${r.slug}`}
                          onClick={close}
                          className="block rounded-xl border border-line/0 bg-surface/40 px-4 py-3 transition hover:border-accent/30 hover:bg-surface/80"
                        >
                          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted">{r.tag}</span>
                          <p className="text-sm font-black text-ink">{r.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{r.description}</p>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {extrasResults.length > 0 && (
                <section>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-accent">
                    Extras · {extrasResults.length} results
                  </p>
                  <ul className="mt-3 space-y-2">
                    {extrasResults.map((r) => (
                      <li key={`extras-${r.slug}`}>
                        <a
                          href={`/extras/${r.slug}`}
                          onClick={close}
                          className="block rounded-xl border border-line/0 bg-surface/40 px-4 py-3 transition hover:border-accent/30 hover:bg-surface/80"
                        >
                          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted">{r.tag}</span>
                          <p className="text-sm font-black text-ink">{r.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{r.description}</p>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
