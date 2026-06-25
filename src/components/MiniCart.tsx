import { useCart } from "../lib/cart";
import Button from "./Button";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

interface MiniCartProps {
  open: boolean;
  onClose: () => void;
}

export default function MiniCart({ open, onClose }: MiniCartProps) {
  const { items, total, count, remove, updateQuantity } = useCart();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-bg-soft shadow-[0_0_60px_rgba(0,0,0,0.6)] transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Mini cart"
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-ink-muted">Cart</p>
            <h2 className="mt-1 text-base font-black tracking-[-0.03em] text-ink">
              {count} {count === 1 ? "item" : "items"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface-ink text-ink transition hover:bg-surface-bright"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-5">
          {items.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-xs">
                <p className="text-2xl font-black tracking-[-0.05em] text-ink">Your cart is empty.</p>
                <p className="mt-2 text-sm text-ink-muted">Browse the store or grab a free extra.</p>
                <div className="mt-6 flex flex-col items-center gap-2">
                  <Button href="/store" onClick={onClose}>Browse store</Button>
                  <a href="/extras" onClick={onClose} className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent">
                    Free extras →
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.slug} className="flex gap-4 rounded-2xl border border-line bg-surface/70 p-4">
                  {/* SECURITY: gradient validated in cart.ts */}
                  <a
                    href={`/store/${item.slug}`}
                    onClick={onClose}
                    className="h-16 w-16 shrink-0 rounded-xl border border-line"
                    style={{ background: item.gradient }}
                    aria-label={item.name}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{item.name}</p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                      {item.tag ?? "Digital"}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.slug, Math.max(1, item.quantity - 1))}
                          className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface-ink text-ink transition hover:bg-surface-bright"
                          aria-label={`Decrease ${item.name}`}
                        >
                          –
                        </button>
                        <span className="w-7 text-center text-xs font-black text-ink">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.slug, Math.min(99, item.quantity + 1))}
                          className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface-ink text-ink transition hover:bg-surface-bright"
                          aria-label={`Increase ${item.name}`}
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs font-black text-ink">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.slug)}
                    className="self-start text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-red-400"
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <footer className="border-t border-line bg-bg-soft/80 px-5 py-5">
            <div className="flex justify-between text-base">
              <span className="font-bold text-ink">Subtotal</span>
              <span className="font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                {formatPrice(total)}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-muted">
              Delivery: instant digital download. Secure checkout.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button href="/checkout" onClick={onClose}>Proceed to checkout</Button>
              <a
                href="/cart"
                onClick={onClose}
                className="text-center text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
              >
                View full cart
              </a>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
