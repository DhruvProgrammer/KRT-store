import { useEffect, useState } from "react";
import { useCart } from "../lib/cart";
import MiniCart from "./MiniCart";
import SearchModal, { type SearchProduct, type SearchExtra } from "./SearchModal";

interface HeaderControlsProps {
  products?: SearchProduct[];
  extras?: SearchExtra[];
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HeaderControls({ products = [], extras = [] }: HeaderControlsProps) {
  const { count } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Open search"
        title="Search (⌘K)"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-ink text-ink transition hover:border-accent/40 hover:bg-surface-bright md:hidden"
      >
        <SearchIcon />
      </button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Open search"
        title="Search (⌘K)"
        className="hidden h-10 items-center gap-2 rounded-full border border-line bg-surface-ink px-4 text-xs font-bold text-ink-muted transition hover:border-accent/40 hover:bg-surface-bright md:inline-flex"
      >
        <SearchIcon />
        <span>Search</span>
        <span aria-hidden="true" className="hidden rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-ink-muted lg:inline-block">
          ⌘K
        </span>
      </button>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        aria-label={`View cart, ${count} ${count === 1 ? "item" : "items"}`}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-ink text-ink transition hover:border-accent/40 hover:bg-surface-bright"
      >
        <CartIcon />
        <span
          className={`pointer-events-none absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-accent px-1 text-[10px] font-black text-white shadow-[0_0_12px_rgba(0,162,255,0.5)] transition-opacity ${
            count > 0 ? "opacity-100" : "opacity-0"
          }`}
        >
          <span>{count}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("krt:toggle-menu"));
        }}
        aria-label="Open menu"
        aria-expanded="false"
        data-mobile-trigger
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-ink text-ink transition hover:bg-surface-bright md:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={products}
        extras={extras}
      />
      <MiniCart open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
