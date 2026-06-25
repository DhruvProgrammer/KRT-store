import { useCart, type CartItem } from "../lib/cart";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

function CartLine({ item }: { item: CartItem }) {
  const { remove, updateQuantity } = useCart();
  return (
    <Reveal>
      <div className="flex items-center gap-5 rounded-[1.25rem] border border-line bg-surface/70 p-5 shadow-soft transition hover:border-accent/30 hover:shadow-[0_0_22px_rgba(0,162,255,0.15)]">
        {/* SECURITY: `item.gradient` is from the validated cart store (see `cart.ts` `sanitizeGradient`). */}
        <a
          href={item.slug.startsWith("/") ? item.slug : `/store/${item.slug}`}
          className="block h-20 w-20 shrink-0 rounded-2xl border border-line"
          style={{ background: item.gradient }}
          aria-label={`View ${item.name}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
            {item.tag ?? "Digital"}
          </p>
          <p className="truncate text-base font-black tracking-[-0.03em] text-ink">{item.name}</p>
          <p className="mt-1 text-xs text-ink-muted">{formatPrice(item.price)} each</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor={`qty-${item.slug}`}>Quantity</label>
          <input
            id={`qty-${item.slug}`}
            type="number"
            min={1}
            max={99}
            value={item.quantity}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              updateQuantity(item.slug, Number.isFinite(n) && n > 0 && n <= 99 ? n : 1);
            }}
            className="h-10 w-16 rounded-full border border-line bg-surface/60 px-3 text-center text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => remove(item.slug)}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-ink/60 text-ink-muted transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
            aria-label={`Remove ${item.name}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export default function CartList() {
  const { items, total, count, clear, updateQuantity } = useCart();

  if (!items.length) {
    return (
      <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg text-center">
          <Reveal>
            <p className="mb-5 text-xs font-black uppercase tracking-[0.28em] text-ink-muted">Cart</p>
            <h1 className="text-5xl font-black tracking-[-0.07em] text-ink sm:text-6xl">Your cart is empty.</h1>
            <p className="mt-5 text-lg leading-8 text-ink-muted">Add some digital goods to get started.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/store">Browse the store</Button>
              <Button variant="secondary" href="/extras">Free extras</Button>
            </div>
          </Reveal>
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
      <Reveal>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-ink-muted">Cart</p>
            <h1 className="text-4xl font-black tracking-[-0.07em] text-ink sm:text-5xl">
              {count} {count === 1 ? "item" : "items"} in your cart.
            </h1>
          </div>
          <button
            type="button"
            onClick={clear}
            className="rounded-full border border-line bg-surface/60 px-4 py-2 text-sm font-bold text-ink-muted transition hover:border-accent/40 hover:text-accent"
          >
            Clear all
          </button>
        </div>
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {items.map((item) => (
            <CartLine key={item.slug} item={item} />
          ))}
          <div className="flex items-center gap-3 pt-2">
            <a
              href="/store"
              className="text-xs font-black uppercase tracking-[0.2em] text-ink-muted transition hover:text-accent"
            >
              ← Keep shopping
            </a>
          </div>
        </div>

        <Reveal delay={0.08}>
          <div className="sticky top-32 h-fit rounded-[1.25rem] border border-line bg-surface/80 p-6 shadow-soft">
            <span className="mb-2 inline-block rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-accent">
              Order
            </span>
            <h2 className="text-lg font-black tracking-[-0.03em] text-ink">Order summary</h2>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="font-black text-ink">{formatPrice(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tax</dt>
                <dd className="text-ink-muted">$0.00</dd>
              </div>
              <div className="border-t border-line pt-3">
                <div className="flex justify-between text-base">
                  <dt className="font-bold text-ink">Total</dt>
                  <dd className="font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                    {formatPrice(total)}
                  </dd>
                </div>
              </div>
            </dl>

            <div className="mt-6">
              <Button href="/checkout">Proceed to checkout</Button>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <TrustMicroBar variant="compact" />
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
              Delivery: instant digital download. Access: via email & your account dashboard.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
