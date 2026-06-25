import { useState } from "react";
import { useCart } from "../lib/cart";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

const inputClass =
  "h-12 w-full rounded-full border border-line bg-surface/60 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent";

export default function CheckoutForm() {
  const { items, total, count, clear } = useCart();
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-lg rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-10 text-center">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Order confirmed (demo)</p>
            <h1 className="text-4xl font-black tracking-[-0.07em] text-ink sm:text-5xl">
              Thank you for your purchase.
            </h1>
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              In a real store, your download links and license keys would arrive in your inbox within minutes. This demo doesn't process payments.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/store">Continue shopping</Button>
              <Button variant="secondary" href="/extras">Browse free extras</Button>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-lg text-center">
            <p className="mb-5 text-xs font-black uppercase tracking-[0.28em] text-ink-muted">Checkout</p>
            <h1 className="text-5xl font-black tracking-[-0.07em] text-ink sm:text-6xl">Your cart is empty.</h1>
            <p className="mt-5 text-lg leading-8 text-ink-muted">Add some products before checking out.</p>
            <div className="mt-9">
              <Button href="/store">Browse the store</Button>
            </div>
          </div>
        </Reveal>
      </section>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clear();
    setSubmitted(true);
  };

  return (
    <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
      <Reveal>
        <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-ink-muted">Checkout</p>
        <h1 className="text-4xl font-black tracking-[-0.07em] text-ink sm:text-5xl">Complete your order.</h1>
      </Reveal>

      <Reveal delay={0.06}>
        <ol className="mt-8 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em]" aria-label="Checkout progress">
          {[
            { id: 1, label: "Contact" },
            { id: 2, label: "Payment" },
            { id: 3, label: "Review" }
          ].map((step, idx, arr) => (
            <li key={step.id} className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full border ${
                  step.id <= 2
                    ? "border-accent bg-accent text-ink-inverse shadow-[0_0_18px_rgba(0,162,255,0.35)]"
                    : "border-line bg-surface/60 text-ink-muted"
                }`}
                aria-current={step.id === 2 ? "step" : undefined}
              >
                {step.id}
              </span>
              <span className={step.id <= 2 ? "text-ink" : "text-ink-muted"}>{step.label}</span>
              {idx < arr.length - 1 && (
                <span aria-hidden="true" className="mx-2 hidden h-px w-10 bg-line sm:inline-block" />
              )}
            </li>
          ))}
        </ol>
      </Reveal>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <Reveal delay={0.12}>
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
            <fieldset>
              <legend className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Contact</legend>
              <label htmlFor="email" className="mb-2 block text-sm font-bold text-ink">Email address</label>
              <input id="email" type="email" required placeholder="you@example.com" autoComplete="off" className={inputClass} />
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Payment (demo)</legend>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-bold text-ink">Name on card</label>
                  <input id="name" type="text" required autoComplete="off" placeholder="Jane Doe" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="card" className="mb-2 block text-sm font-bold text-ink">Card number — do not enter real data</label>
                  <input
                    id="card"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    required
                    autoComplete="off"
                    placeholder="—"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="expiry" className="mb-2 block text-sm font-bold text-ink">Expiry</label>
                    <input id="expiry" type="text" autoComplete="off" placeholder="MM/YY" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="cvc" className="mb-2 block text-sm font-bold text-ink">CVC</label>
                    <input
                      id="cvc"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="—"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </fieldset>

            <div className="border-t border-line pt-5">
              <Button type="submit" className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]">
                Place order · {formatPrice(total)}
              </Button>
              <a
                href="/cart"
                className="mt-3 block text-center text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
              >
                ← Back to cart
              </a>
            </div>
          </form>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="sticky top-32 h-fit rounded-[1.25rem] border border-line bg-surface/80 p-6 shadow-soft">
            <span className="mb-2 inline-block rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-accent">
              Order
            </span>
            <h2 className="text-lg font-black tracking-[-0.03em] text-ink">Order summary</h2>

            <ul className="mt-6 space-y-4">
              {items.map((item) => (
                <li key={item.slug} className="flex items-center gap-3">
                  {/* SECURITY: `item.gradient` validated in cart.ts. */}
                  <div
                    className="h-10 w-10 shrink-0 rounded-xl border border-line"
                    style={{ background: item.gradient }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{item.name}</p>
                    <p className="text-xs text-ink-muted">Qty {item.quantity}</p>
                  </div>
                  <span className="text-sm font-black text-ink">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="font-black text-ink">{formatPrice(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tax</dt>
                <dd className="text-ink-muted">$0.00</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base">
                <dt className="font-bold text-ink">Total</dt>
                <dd className="font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                  {formatPrice(total)}
                </dd>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <TrustMicroBar variant="full" />
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
              {count} {count === 1 ? "item" : "items"} · delivery via email & account dashboard.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
