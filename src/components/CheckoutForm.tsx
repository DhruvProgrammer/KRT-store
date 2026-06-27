import { useState } from "react";
import {
  useCart,
  PAYMENT_METHODS,
  paymentLabel,
  type PaymentMethod
} from "../lib/cart";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

const inputClass =
  "h-12 w-full rounded-full border border-line bg-surface/60 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent";

function PaymentLogo({ method }: { method: PaymentMethod }) {
  if (method === "stripe")
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-[#635BFF] text-[10px] font-black tracking-[0.18em] text-white">stripe</span>
    );
  if (method === "card")
    return (
      <span aria-hidden="true" className="flex h-7 w-12 items-center justify-center gap-0.5 rounded-md border border-line-bright bg-bg-raised">
        <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#EB001B] text-[7px] font-black text-white">MC</span>
        <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#1A1F71] text-[7px] font-black text-white">V</span>
      </span>
    );
  if (method === "razorpay")
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-[#3395FF] text-[10px] font-black tracking-[0.12em] text-white">R</span>
    );
  if (method === "upi")
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-gradient-to-r from-[#097939] to-[#E59B2C] text-[10px] font-black tracking-[0.16em] text-white">UPI</span>
    );
  if (method === "bitcoin")
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-[#F7931A] text-[12px] font-black text-white">₿</span>
    );
  return null;
}

/* ------------------------- Payment input blocks ----------------------- */
function CardFields() {
  return (
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
  );
}

function StripeFields() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface/40 p-4 text-xs leading-relaxed text-ink-muted">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-accent">Stripe Checkout</p>
        In production this opens <span className="font-bold text-ink">Stripe Elements / Checkout</span> — a PCI-compliant
        embedded form. The prototype shows the same shape but skips real validation.
      </div>
      <div>
        <label htmlFor="stripe-email" className="mb-2 block text-sm font-bold text-ink">Email (Stripe receipt)</label>
        <input id="stripe-email" type="email" required placeholder="you@example.com" className={inputClass} />
      </div>
      <div>
        <label htmlFor="stripe-card" className="mb-2 block text-sm font-bold text-ink">Card details</label>
        <input
          id="stripe-card"
          type="text"
          inputMode="numeric"
          pattern="[0-9 ]*"
          required
          autoComplete="off"
          placeholder="4242 4242 4242 4242 (test)"
          className={inputClass}
        />
      </div>
    </div>
  );
}

function RazorpayFields() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface/40 p-4 text-xs leading-relaxed text-ink-muted">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-accent">Razorpay Checkout</p>
        In production this opens the <span className="font-bold text-ink">Razorpay Standard Checkout</span> modal and
        supports UPI, cards, netbanking, and wallets. The prototype skips the redirect.
      </div>
      <div>
        <label htmlFor="rp-contact" className="mb-2 block text-sm font-bold text-ink">Mobile / Email</label>
        <input id="rp-contact" type="text" required placeholder="9876543210 or you@example.com" className={inputClass} />
      </div>
    </div>
  );
}

function UpiFields() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface/40 p-4 text-xs leading-relaxed text-ink-muted">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-accent">UPI</p>
        Enter your UPI ID (e.g. <span className="font-mono text-ink">name@bank</span>). We'll send a collect request
        to your UPI app — prototype only, no real request is made.
      </div>
      <div>
        <label htmlFor="upi-id" className="mb-2 block text-sm font-bold text-ink">UPI ID</label>
        <input id="upi-id" type="text" required placeholder="yourname@okbank" pattern="[a-zA-Z0-9._\-]+@[a-zA-Z]+" className={inputClass} />
      </div>
    </div>
  );
}

function BitcoinFields() {
  // Generate a deterministic-looking demo wallet address (prototype only).
  const demoAddress = "bc1qkrt" + Math.random().toString(36).slice(2, 10) + "demo";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#F7931A]/30 bg-[#F7931A]/5 p-4 text-xs leading-relaxed text-ink-muted">
        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#F7931A]">Bitcoin</p>
        Send the exact amount to the address below from your BTC wallet. The order auto-confirms after 1 blockchain
        confirmation — prototype only, no on-chain check is made.
      </div>
      <div className="rounded-xl border border-line bg-bg-raised p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-muted">Send BTC to</p>
        <p className="mt-1 break-all font-mono text-sm text-ink">{demoAddress}</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ink-muted">Network · Bitcoin (Mainnet)</p>
      </div>
      <div>
        <label htmlFor="btc-tx" className="mb-2 block text-sm font-bold text-ink">Transaction ID (after sending)</label>
        <input id="btc-tx" type="text" placeholder="Paste txid here" className={inputClass} />
      </div>
    </div>
  );
}

function PaymentFields({ method }: { method: PaymentMethod }) {
  if (method === "stripe") return <StripeFields />;
  if (method === "card") return <CardFields />;
  if (method === "razorpay") return <RazorpayFields />;
  if (method === "upi") return <UpiFields />;
  if (method === "bitcoin") return <BitcoinFields />;
  return null;
}

/* ------------------------------- Main --------------------------------- */
export default function CheckoutForm() {
  const { items, total, count, clear, paymentMethod, setPaymentMethod } = useCart();
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
              You paid via <span className="font-bold text-ink">{paymentLabel(paymentMethod)}</span>. In a real store, your
              download links and license keys would arrive in your inbox within minutes. This demo doesn't process payments.
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
              <legend className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Payment method</legend>
              <div className="mb-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((method) => {
                  const active = method === paymentMethod;
                  const id = `ck-pay-${method}`;
                  return (
                    <label
                      key={method}
                      htmlFor={id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                        active
                          ? "border-accent bg-accent/10 shadow-[0_0_18px_rgba(0,162,255,0.18)]"
                          : "border-line bg-surface/40 hover:border-accent/30"
                      }`}
                    >
                      <input
                        id={id}
                        type="radio"
                        name="ck-payment-method"
                        value={method}
                        checked={active}
                        onChange={() => setPaymentMethod(method)}
                        className="h-4 w-4 cursor-pointer accent-accent"
                      />
                      <PaymentLogo method={method} />
                      <span className="flex-1 text-sm font-bold text-ink">{paymentLabel(method)}</span>
                    </label>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-line bg-surface/40 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <PaymentLogo method={paymentMethod} />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ink-muted">Selected</p>
                    <p className="text-sm font-bold text-ink">{paymentLabel(paymentMethod)}</p>
                  </div>
                </div>
                <PaymentFields method={paymentMethod} />
              </div>
            </fieldset>

            <div className="border-t border-line pt-5">
              <Button type="submit" className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]">
                Pay {formatPrice(total)} via {paymentLabel(paymentMethod)}
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
              {count} {count === 1 ? "item" : "items"} · paying with {paymentLabel(paymentMethod)}.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}