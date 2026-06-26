import { useState } from "react";
import type { Product } from "../data/products";
import { cart } from "../lib/cart";
import Button from "./Button";
import Stars from "./Stars";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 text-emerald-300" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
}

function AccordionItem({ title, children }: AccordionItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group border-b border-line py-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left font-bold text-ink transition hover:text-accent-bright"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-base sm:text-lg">{title}</span>
        <span
          className={`ml-4 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-black text-accent transition ${
            open ? "rotate-45 bg-accent/20 shadow-[0_0_18px_rgba(0,162,255,0.4)]" : ""
          }`}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export default function ProductDetail({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    try {
      cart.add({
        slug: product.slug,
        name: product.name,
        price: product.price,
        gradient: product.gradient,
        tag: product.tag,
        quantity: 1
      });
      setAdded(true);
      window.dispatchEvent(new CustomEvent("krt:open-cart"));
      window.setTimeout(() => setAdded(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <article>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: gallery — UX.md §6.1 */}
        <Reveal>
          <div className="overflow-hidden rounded-[2rem] border border-line">
            {/* SECURITY: `gradient` is static data from `src/data/products.ts`. */}
            <div
              className="aspect-[4/3] sm:aspect-[16/10]"
              style={{ background: product.gradient }}
              role="img"
              aria-label={`${product.name} preview`}
            />
            <div className="grid grid-cols-4 gap-2 border-t border-line bg-bg-soft/70 p-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl border border-line/60"
                  style={{ background: product.gradient, opacity: 0.4 + i * 0.15 }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        </Reveal>

        {/* RIGHT: info + CTAs — UX.md §6.2 */}
        <div>
          <Reveal delay={0.06}>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-ink-muted">
              {product.tag}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] text-ink sm:text-6xl">
              {product.name}
            </h1>
            <div className="mt-4">
              <Stars value={product.rating} count={product.reviewCount} size="md" />
            </div>
            <p className="mt-5 text-lg leading-8 text-ink-muted">{product.longDescription}</p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {product.highlights.map((h) => (
                <div
                  key={h.label}
                  className="rounded-3xl border border-line bg-surface/70 p-4 transition hover:border-accent/30 hover:shadow-[0_0_22px_rgba(0,162,255,0.18)]"
                >
                  <dd className="text-2xl font-black tracking-[-0.05em] text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                    {h.value}
                  </dd>
                  <dd className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
                    {h.label}
                  </dd>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 rounded-2xl border border-line bg-surface/70 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">Regular license</p>
                  <p className="mt-1 text-4xl font-black tracking-[-0.05em] text-accent drop-shadow-[0_0_10px_rgba(0,162,255,0.3)]">
                    ${product.price}
                  </p>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                  One-time · perpetual
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  onClick={handleAdd}
                  className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]"
                >
                  {added ? (
                    <>
                      <CheckIcon />
                      <span className="ml-1">Added to cart</span>
                    </>
                  ) : (
                    <>
                      <PlusIcon />
                      <span className="ml-1">Add to cart · ${product.price}</span>
                    </>
                  )}
                </Button>
                <Button variant="secondary" href="/cart" className="w-full justify-center">
                  <CartIcon />
                  <span className="ml-1">View cart</span>
                </Button>
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <TrustMicroBar variant="full" />
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* BELOW THE FOLD: collapsible sections — UX.md §6.2 (Description / Features / Compatibility / Changelog / FAQ) */}
      <Reveal delay={0.2}>
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="mb-4 text-2xl font-black tracking-[-0.06em] text-ink">Product details</h2>
          <div className="border-t border-line">
            <AccordionItem title="Description">
              <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{product.longDescription}</p>
            </AccordionItem>
            <AccordionItem title="Features">
              <ul className="grid max-w-3xl gap-2 sm:grid-cols-2">
                {product.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm leading-7 text-ink-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(0,162,255,0.7)]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </AccordionItem>
            <AccordionItem title="Requirements & compatibility">
              <ul className="flex flex-wrap gap-2">
                {product.compatibility.map((c) => (
                  <li
                    key={c}
                    className="rounded-full border border-accent/30 bg-surface px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-muted"
                  >
                    {c}
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between border-b border-line/60 py-2 text-ink-muted">
                  <dt>Version</dt>
                  <dd className="font-bold text-ink">{product.version}</dd>
                </div>
                <div className="flex justify-between border-b border-line/60 py-2 text-ink-muted">
                  <dt>File size</dt>
                  <dd className="font-bold text-ink">{product.fileSize}</dd>
                </div>
              </dl>
            </AccordionItem>
            <AccordionItem title="Changelog">
              <ul className="space-y-2 text-sm text-ink-muted">
                <li className="flex gap-3">
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-accent">
                    Latest
                  </span>
                  <span><strong className="text-ink">{product.version}</strong> — Improvements to performance and accessibility.</span>
                </li>
                <li className="flex gap-3">
                  <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-ink-muted">
                    Older
                  </span>
                  <span>Historical versions and migration notes are included in the download.</span>
                </li>
              </ul>
            </AccordionItem>
            <AccordionItem title="Customer reviews">
              <div className="space-y-3 text-sm text-ink-muted">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-black text-ink">{product.rating.toFixed(1)}</span>
                  <Stars value={product.rating} size="md" />
                  <span>Based on {product.reviewCount.toLocaleString()} reviews.</span>
                </div>
                <p className="max-w-2xl">
                  Verified buyers rate each release for clarity, performance, and support. Reviews are aggregated across versions.
                </p>
              </div>
            </AccordionItem>
            <AccordionItem title="Support & documentation">
              <p className="max-w-3xl text-sm text-ink-muted">
                48-hour response on business days, knowledge base, and migration guides included. Help is bundled for the first six months; lifetime support is available as an add-on.
              </p>
            </AccordionItem>
          </div>
        </section>
      </Reveal>

      {/* CTA repeated per UX.md §9 */}
      <section className="mt-16 rounded-3xl border border-line bg-bg-soft/50 p-8 text-center sm:p-12">
        <h2 className="mt-3 text-2xl font-black tracking-[-0.05em] text-ink sm:text-3xl">
          Ready to ship {product.name}?
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Instant download. Lifetime updates. 30-day refund.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={handleAdd}>Add to cart · ${product.price}</Button>
          <Button variant="secondary" href="/store">Keep browsing</Button>
        </div>
      </section>
    </article>
  );
}
