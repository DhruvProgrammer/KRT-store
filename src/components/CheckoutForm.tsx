import { useMemo, useState, useEffect } from "react";
import {
  useCart,
  PAYMENT_METHODS,
  paymentLabel,
  type PaymentMethod
} from "../lib/cart";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";
import OtpInput from "./OtpInput";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

function getGuestId(): string {
  let id = localStorage.getItem("dg-guest-id");
  if (!id) {
    id = "guest-" + Math.random().toString(36).slice(2);
    localStorage.setItem("dg-guest-id", id);
  }
  return id;
}

function recordLocalOrder(order: { id: string }, email: string, itemCount: number, total: number): void {
  try {
    const key = "dg-orders";
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.unshift({
      id: order.id,
      email,
      items: itemCount,
      total,
      date: new Date().toISOString().slice(0, 10),
      status: "paid"
    });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* non-fatal */
  }
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

/* ------------------------- Payment fields ----------------------- */
function PaymentFields({ method }: { method: PaymentMethod }) {
  if (method === "stripe") {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Safe and secure checkout via Stripe. You will be redirected to Stripe to finalize your payment.
      </p>
    );
  }
  if (method === "razorpay") {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Safe and secure checkout via Razorpay. You will be redirected to Razorpay to finalize your payment.
      </p>
    );
  }
  if (method === "bitcoin") {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Payment via Bitcoin. The Bitcoin wallet address and invoice will be displayed upon order submission.
      </p>
    );
  }
  if (method === "upi") {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          Pay directly using your UPI application. Please enter your Virtual Payment Address (UPI ID) below:
        </p>
        <input
          id="upi-id"
          type="text"
          required
          placeholder="username@bank"
          className={inputClass}
        />
      </div>
    );
  }
  // card
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        Credit or debit card payment. All card details are processed securely.
      </p>
      <div className="space-y-3">
        <input
          id="card-name"
          type="text"
          required
          placeholder="Cardholder name"
          className={inputClass}
        />
        <input
          id="card-number"
          type="text"
          required
          placeholder="Card number (4111 2222 3333 4444)"
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            id="card-expiry"
            type="text"
            required
            placeholder="MM/YY"
            className={inputClass}
          />
          <input
            id="card-cvc"
            type="text"
            required
            placeholder="CVC"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Main --------------------------------- */
export default function CheckoutForm() {
  const { items, total, count, clear, paymentMethod, setPaymentMethod } = useCart();
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (otpResendCooldown > 0) {
      const t = setInterval(() => setOtpResendCooldown(c => c - 1), 1000);
      return () => clearInterval(t);
    }
  }, [otpResendCooldown]);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const API_URL = import.meta.env.PUBLIC_API_URL;
  if (!API_URL) {
    throw new Error("PUBLIC_API_URL is not set");
  }

  const sendCode = async () => {
    if (!isValidEmail) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), purpose: "checkout" })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to send code");
      setOtpSent(true);
      setOtpResendCooldown(60);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (otpResendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), purpose: "checkout" })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to resend code");
      setOtpResendCooldown(60);
      setErrorMessage("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");

    if (!isValidEmail) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    if (!otpSent || otp.length !== 6) {
      setErrorMessage("Verify your email with the 6-digit code before placing the order.");
      return;
    }

    const API_URL = import.meta.env.PUBLIC_API_URL;
    if (!API_URL) {
      throw new Error("PUBLIC_API_URL is not set");
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getGuestId()
        },
        body: JSON.stringify({
          email: email.trim(),
          otp,
          items: items.map((i) => ({ slug: i.slug, name: i.name, price: i.price, quantity: i.quantity })),
          total,
          paymentMethod
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.order) {
        setErrorMessage(data?.error || `Order failed (status ${res.status})`);
        return;
      }
      recordLocalOrder(data.order, email.trim(), items.length, total);
      clear();
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setErrorMessage(err instanceof Error ? `Network connection failed: ${err.message}` : "Network connection failed");
    } finally {
      setLoading(false);
    }
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
            { id: 2, label: "Payment" }
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
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset>
              <legend className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">Contact</legend>
              <label htmlFor="email" className="mb-2 block text-sm font-bold text-ink">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
              <div className="mt-4">
                {!otpSent ? (
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={!isValidEmail || loading}
                    className="text-sm font-black text-accent transition hover:text-accent-bright disabled:opacity-40"
                  >
                    {loading ? "Sending…" : "Email me a verification code →"}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-ink">Verification code</label>
                    <OtpInput value={otp} onChange={setOtp} />
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-ink-muted">Code expires in 10 minutes.</p>
                      <button
                        type="button"
                        disabled={otpResendCooldown > 0 || loading}
                        onClick={resendCode}
                        className="text-xs font-black uppercase tracking-[0.18em] text-accent transition hover:text-accent-bright disabled:opacity-40"
                      >
                        {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : "Resend code"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
                        className="h-5 w-5 cursor-pointer accent-accent"
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
              {errorMessage && (
                <p className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200" role="alert">{errorMessage}</p>
              )}
              <Button type="submit" className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]" disabled={loading}>
                {loading ? "Placing order…" : `Pay ${formatPrice(total)} via ${paymentLabel(paymentMethod)}`}
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