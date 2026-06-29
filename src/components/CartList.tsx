import { useState } from "react";
import {
  useCart,
  PAYMENT_METHODS,
  paymentLabel,
  type CartItem,
  type PaymentMethod
} from "../lib/cart";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents);
}

/* ------------------------------- Icons -------------------------------- */
function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------- Payment method logos ----------------------- */
// Pure SVG/CSS so we don't depend on remote images. Keeps the prototype fully self-contained.
function PaymentLogo({ method }: { method: PaymentMethod }) {
  if (method === "stripe") {
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-[#635BFF] text-[10px] font-black tracking-[0.18em] text-white">
        stripe
      </span>
    );
  }
  if (method === "card") {
    return (
      <span aria-hidden="true" className="flex h-7 w-12 items-center justify-center gap-0.5 rounded-md border border-line-bright bg-bg-raised">
        <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#EB001B] text-[7px] font-black text-white">MC</span>
        <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#1A1F71] text-[7px] font-black text-white">V</span>
      </span>
    );
  }
  if (method === "razorpay") {
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-[#3395FF] text-[10px] font-black tracking-[0.12em] text-white">
        R
      </span>
    );
  }
  if (method === "upi") {
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-gradient-to-r from-[#097939] to-[#E59B2C] text-[10px] font-black tracking-[0.16em] text-white">
        UPI
      </span>
    );
  }
  if (method === "bitcoin") {
    return (
      <span aria-hidden="true" className="grid h-7 w-12 place-items-center rounded-md bg-[#F7931A] text-[12px] font-black text-white">
        ₿
      </span>
    );
  }
  return null;
}

/* -------------------------- Quantity stepper -------------------------- */
function QuantityStepper({
  value,
  onChange,
  inputId
}: {
  value: number;
  onChange: (n: number) => void;
  inputId: string;
}) {
  // Clamp 1..99
  const dec = () => onChange(Math.max(1, value - 1));
  const inc = () => onChange(Math.min(99, value + 1));
  const stepBtn =
    "grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-ink text-ink transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-ink p-1">
      <button
        type="button"
        onClick={dec}
        disabled={value <= 1}
        className={stepBtn}
        aria-label={`Decrease quantity of item ${inputId}`}
      >
        <MinusIcon />
      </button>
      <label className="sr-only" htmlFor={inputId}>Quantity</label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          if (raw === "") return;
          const n = parseInt(raw, 10);
          if (Number.isFinite(n)) onChange(Math.max(1, Math.min(99, n)));
        }}
        onBlur={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isFinite(n) || n < 1) onChange(1);
        }}
        className="h-9 w-12 bg-transparent text-center text-sm font-bold text-ink outline-none"
        aria-label={`Quantity for item ${inputId}`}
      />
      <button
        type="button"
        onClick={inc}
        disabled={value >= 99}
        className={stepBtn}
        aria-label={`Increase quantity of item ${inputId}`}
      >
        <PlusIcon />
      </button>
    </div>
  );
}

/* ----------------------------- Cart line ------------------------------ */
function CartLine({
  item,
  selected,
  onToggleSelect
}: {
  item: CartItem;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { remove, updateQuantity, saveForLater } = useCart();
  return (
    <Reveal>
      <article className="rounded-2xl border border-line bg-surface/60 p-4 shadow-soft transition hover:border-accent/30 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          {/* Select checkbox (Amazon-style) */}
          <label className="flex shrink-0 items-start pt-2 sm:pt-4">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-4 w-4 cursor-pointer rounded border-line bg-surface-ink accent-accent"
              aria-label={`Select ${item.name} for checkout`}
            />
          </label>

          {/* Product thumb */}
          {/* SECURITY: `item.gradient` validated in cart.ts. */}
          <a
            href={item.slug.startsWith("/") ? item.slug : `/store/${item.slug}`}
            className="block h-24 w-24 shrink-0 rounded-xl border border-line sm:h-28 sm:w-28"
            style={{ background: item.gradient }}
            aria-label={`View ${item.name}`}
          />

          {/* Title + meta + actions */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent">
                {item.tag ?? "Digital"}
              </p>
              <a
                href={item.slug.startsWith("/") ? item.slug : `/store/${item.slug}`}
                className="line-clamp-2 text-base font-bold tracking-[-0.02em] text-ink transition hover:text-accent sm:text-lg"
              >
                {item.name}
              </a>
              <p className="text-xs text-ink-muted">
                In stock · Instant download · Lifetime updates
              </p>
            </div>

            {/* Quantity + actions row */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <QuantityStepper
                value={item.quantity}
                onChange={(n) => updateQuantity(item.slug, n)}
                inputId={`qty-${item.slug}`}
              />

              <span className="hidden h-5 w-px bg-line sm:inline-block" aria-hidden="true" />

              <button
                type="button"
                onClick={() => remove(item.slug)}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-ink-muted transition hover:text-red-400"
              >
                <TrashIcon /> Delete
              </button>

              <span className="hidden h-3 w-px bg-line sm:inline-block" aria-hidden="true" />

              <button
                type="button"
                onClick={() => saveForLater(item.slug)}
                className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted transition hover:text-accent"
              >
                Save for later
              </button>
            </div>
          </div>

          {/* Per-line subtotal */}
          <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-start sm:text-right">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-muted sm:hidden">Subtotal</span>
            <span className="text-lg font-black tracking-[-0.03em] text-ink">
              {formatPrice(item.price * item.quantity)}
            </span>
            <span className="text-xs text-ink-muted">{formatPrice(item.price)} each</span>
          </div>
        </div>
      </article>
    </Reveal>
  );
}

/* ------------------------------ Saved row ----------------------------- */
function SavedRow({ item }: { item: CartItem }) {
  const { moveToCart, removeSaved } = useCart();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/40 p-3">
      <span
        aria-hidden="true"
        className="h-12 w-12 shrink-0 rounded-lg border border-line"
        style={{ background: item.gradient }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{item.name}</p>
        <p className="text-xs text-ink-muted">{formatPrice(item.price)}</p>
      </div>
      <button
        type="button"
        onClick={() => moveToCart(item.slug)}
        className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-accent transition hover:bg-accent hover:text-white"
      >
        Move to cart
      </button>
      <button
        type="button"
        onClick={() => removeSaved(item.slug)}
        className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-red-400"
        aria-label={`Remove ${item.name} from saved items`}
      >
        Remove
      </button>
    </div>
  );
}

/* --------------------------- Payment picker --------------------------- */
function PaymentMethodPicker({
  selected,
  onSelect
}: {
  selected: PaymentMethod;
  onSelect: (m: PaymentMethod) => void;
}) {
  return (
    <fieldset className="mt-6 border-t border-line pt-5">
      <legend className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
        Payment method
      </legend>
      <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
        Pick how you'd like to pay — prototype only, no real charge is made.
      </p>
      <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((method) => {
          const active = method === selected;
          const id = `pay-${method}`;
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
                name="payment-method"
                value={method}
                checked={active}
                onChange={() => onSelect(method)}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              <PaymentLogo method={method} />
              <span className="flex-1 text-sm font-bold text-ink">{paymentLabel(method)}</span>
              {active && (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-ink-inverse">
                  <CheckIcon />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------- Empty -------------------------------- */
function EmptyCart() {
  return (
    <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg text-center">
        <Reveal>
          <p className="mb-5 text-xs font-black uppercase tracking-[0.28em] text-ink-muted">Cart</p>
          <h1 className="text-5xl font-black tracking-[-0.07em] text-ink sm:text-6xl">Your cart is empty.</h1>
          <p className="mt-5 text-lg leading-8 text-ink-muted">
            Add some digital goods to get started — they're available instantly after checkout.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/store">Browse the store</Button>
            <Button variant="secondary" href="/extras">Free extras</Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------ Main ---------------------------------- */
export default function CartList() {
  const {
    items,
    savedForLater,
    paymentMethod,
    setPaymentMethod,
    total,
    count,
    clear
  } = useCart();

  // Selection state — Amazon-style multi-select for checkout. Defaults to all selected.
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(() => new Set(items.map((i) => i.slug)));
  const toggleSelect = (slug: string) =>
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  if (!items.length) return <EmptyCart />;

  const selectedItems = items.filter((i) => selectedSlugs.has(i.slug));
  const selectedTotal = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const hasSelection = selectedItems.length > 0;

  return (
    <section className="container mx-auto px-4 pt-6 pb-20 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Reveal>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.28em] text-ink-muted">Shopping cart</p>
            <h1 className="text-3xl font-black tracking-[-0.05em] text-ink sm:text-4xl">
              {count} {count === 1 ? "item" : "items"} ready for checkout
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/store"
              className="rounded-full border border-line bg-surface/60 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-accent/40 hover:text-accent"
            >
              Continue shopping
            </a>
            <button
              type="button"
              onClick={clear}
              className="rounded-full border border-line bg-surface/60 px-4 py-2 text-xs font-bold text-ink-muted transition hover:border-red-500/40 hover:text-red-400"
            >
              Clear cart
            </button>
          </div>
        </header>
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* LEFT — items + saved-for-later */}
        <div className="space-y-6">
          {/* Select-all row */}
          <Reveal>
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-ink/60 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
                <input
                  type="checkbox"
                  checked={selectedItems.length === items.length && items.length > 0}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selectedItems.length > 0 && selectedItems.length < items.length;
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSlugs(new Set(items.map((i) => i.slug)));
                    } else {
                      setSelectedSlugs(new Set());
                    }
                  }}
                  className="h-4 w-4 cursor-pointer rounded border-line bg-surface-ink accent-accent"
                />
                <span className="text-ink">
                  {hasSelection
                    ? `${selectedItems.length} of ${items.length} selected`
                    : "Select all items"}
                </span>
              </label>
              <span className="text-[11px] text-ink-muted">Price</span>
            </div>
          </Reveal>

          {/* Items list */}
          <div className="space-y-3">
            {items.map((item) => (
              <CartLine
                key={item.slug}
                item={item}
                selected={selectedSlugs.has(item.slug)}
                onToggleSelect={() => toggleSelect(item.slug)}
              />
            ))}
          </div>

          {/* Subtotal at bottom of items list (Amazon does this too) */}
          <Reveal delay={0.04}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-ink/60 px-5 py-4 text-sm">
              <span className="font-bold text-ink-muted">
                Subtotal ({count} {count === 1 ? "item" : "items"}):
              </span>
              <span className="text-2xl font-black tracking-[-0.04em] text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                {formatPrice(total)}
              </span>
            </div>
          </Reveal>

          {/* Save for later section */}
          {savedForLater.length > 0 && (
            <Reveal delay={0.06}>
              <section className="mt-2 rounded-2xl border border-line bg-surface/40 p-5">
                <header className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-black tracking-[-0.03em] text-ink">
                    Saved for later ({savedForLater.length})
                  </h2>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-ink-muted">
                    Not in your cart yet
                  </span>
                </header>
                <div className="space-y-2">
                  {savedForLater.map((item) => (
                    <SavedRow key={item.slug} item={item} />
                  ))}
                </div>
              </section>
            </Reveal>
          )}
        </div>

        {/* RIGHT — sticky summary + payment picker */}
        <Reveal delay={0.08}>
          <aside className="sticky top-32 h-fit rounded-2xl border border-line bg-surface/80 p-6 shadow-soft">
            <span className="mb-2 inline-block rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-accent">
              Order summary
            </span>
            <h2 className="text-lg font-black tracking-[-0.03em] text-ink">
              {hasSelection ? "Ready to pay" : "Choose items to pay"}
            </h2>

            {/* Per-item mini list */}
            <ul className="mt-5 space-y-3">
              {(hasSelection ? selectedItems : items).map((item) => (
                <li key={item.slug} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-9 w-9 shrink-0 rounded-lg border border-line"
                    style={{ background: item.gradient }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {item.name}{" "}
                    <span className="text-ink-muted">× {item.quantity}</span>
                  </span>
                  <span className="shrink-0 font-bold text-ink">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Totals */}
            <dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Items subtotal</dt>
                <dd className="font-bold text-ink">{formatPrice(hasSelection ? selectedTotal : total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd className="text-ink-muted">Instant download</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tax</dt>
                <dd className="text-ink-muted">$0.00</dd>
              </div>
              <div className="border-t border-line pt-3">
                <div className="flex justify-between text-base">
                  <dt className="font-bold text-ink">Order total</dt>
                  <dd className="font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                    {formatPrice(hasSelection ? selectedTotal : total)}
                  </dd>
                </div>
              </div>
            </dl>

            {/* CTA */}
            <div className="mt-6">
              <Button
                href="/checkout"
                className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]"
              >
                {hasSelection
                  ? `Proceed to checkout · ${formatPrice(selectedTotal)}`
                  : `Proceed to checkout · ${formatPrice(total)}`}
              </Button>
              <p className="mt-2 text-center text-[11px] text-ink-muted">
                Paying via <span className="font-bold text-ink">{paymentLabel(paymentMethod)}</span> · prototype
              </p>
            </div>

            {/* Payment picker */}
            <PaymentMethodPicker selected={paymentMethod} onSelect={setPaymentMethod} />

            {/* Trust micro-bar */}
            <div className="mt-6 border-t border-line pt-4">
              <TrustMicroBar variant="compact" />
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
              Delivery: instant digital download. Access: via email & your account dashboard.
            </p>
          </aside>
        </Reveal>
      </div>
    </section>
  );
}