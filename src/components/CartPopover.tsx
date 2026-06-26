import { useEffect, useRef, useState } from "react";
import { useCart } from "../lib/cart";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

export default function CartPopover() {
  const { items, total, count, remove, updateQuantity } = useCart();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("krt:open-cart", openHandler);
    return () => window.removeEventListener("krt:open-cart", openHandler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!popoverRef.current?.contains(target ?? null) && !(target as HTMLElement | null)?.closest("[data-open-cart]")) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Shopping cart preview"
      className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-line bg-bg-soft/95 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      data-cart-popover
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Cart</p>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-ink">
          {count} {count === 1 ? "item" : "items"}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-base font-black text-ink">Your cart is empty.</p>
          <p className="mt-1 text-xs text-ink-muted">Add a product to see it here.</p>
          <a
            href="/store"
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright"
          >
            Browse store
          </a>
        </div>
      ) : (
        <>
          <ul className="max-h-72 space-y-3 overflow-auto px-4 py-3">
            {items.slice(0, 4).map((item) => (
              <li key={item.slug} className="flex gap-3">
                {/* SECURITY: gradient is sanitized in cart.ts */}
                <div
                  className="h-12 w-12 shrink-0 rounded-lg border border-line"
                  style={{ background: item.gradient }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{item.name}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                    Qty {item.quantity}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-muted">
                    <span>{formatPrice(item.price * item.quantity)}</span>
                    <button
                      type="button"
                      onClick={() => remove(item.slug)}
                      className="font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {items.length > 4 && (
              <li>
                <a
                  href="/cart"
                  onClick={() => setOpen(false)}
                  className="block text-center text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
                >
                  + {items.length - 4} more — view cart
                </a>
              </li>
            )}
          </ul>
          <footer className="border-t border-line bg-bg-soft/80 px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="font-bold text-ink">Subtotal</span>
              <span className="font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                {formatPrice(total)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href="/cart"
                onClick={() => setOpen(false)}
                className="rounded-full border border-line px-3 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-ink transition hover:border-accent/40 hover:text-accent"
              >
                View cart
              </a>
              <a
                href="/checkout"
                onClick={() => setOpen(false)}
                className="rounded-full bg-accent px-3 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright"
              >
                Checkout
              </a>
            </div>
            <p className="mt-2 text-[10px] leading-tight text-ink-muted">
              Instant digital download · secure checkout
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
