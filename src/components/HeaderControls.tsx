import { useEffect, useRef, useState } from "react";
import { useCart } from "../lib/cart";
import CartPopover from "./CartPopover";
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

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function HeaderControls({ products = [], extras = [] }: HeaderControlsProps) {
  const { count } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cartContainerRef = useRef<HTMLDivElement | null>(null);

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
      <a
        href="/login"
        className="hidden h-10 items-center gap-2 rounded-full border border-line bg-surface-ink px-4 text-xs font-bold text-ink-muted transition hover:border-accent/40 hover:bg-surface-bright hover:text-ink md:inline-flex"
      >
        <UserIcon />
        <span>Sign in</span>
      </a>

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

      <div ref={cartContainerRef} className="relative">
        <a
          href="/cart"
          onClick={(e) => {
            e.preventDefault();
            setCartOpen((v) => !v);
          }}
          aria-label={`Shopping cart · ${count} ${count === 1 ? "item" : "items"}`}
          aria-expanded={cartOpen}
          data-cart-trigger
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
        </a>
        <CartPopover open={cartOpen} onClose={() => setCartOpen(false)} />
      </div>

      <a
        href="/store"
        className="hidden items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright hover:shadow-[0_0_30px_rgba(0,162,255,0.55)] md:inline-flex"
      >
        Shop now
      </a>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("krt:toggle-menu"))}
        aria-label="Open menu"
        aria-expanded="false"
        data-mobile-trigger
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-ink text-ink transition hover:bg-surface-bright md:hidden"
      >
        <MenuIcon />
      </button>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={products}
        extras={extras}
      />
    </>
  );
}
