import { useState } from "react";
import type { Product } from "../data/products";
import { cart } from "../lib/cart";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [added, setAdded] = useState(false);

  const handleAdd: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    // Stop propagation into any wrapping link overlay.
    event.preventDefault();
    event.stopPropagation();
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
      window.setTimeout(() => setAdded(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <Reveal className="flex w-full">
      {/* `isolate` creates a stacking context so the inner `<a>` overlay and the
          `z-10` button don't bleed into siblings. */}
      <article className="group relative isolate flex w-full flex-col overflow-hidden rounded-[1.25rem] border border-line bg-surface/70 shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_0_28px_rgba(0,162,255,0.18)]">
        {/* SECURITY: gradient is static data from `src/data/products.ts`. */}
        <div
          className="h-44 shrink-0 opacity-90 transition-opacity group-hover:opacity-100"
          style={{ background: product.gradient }}
        />
        <div className="flex flex-1 flex-col p-5 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-ink-muted">{product.tag}</p>
            {/* ponytail: the star rating was removed with the fabricated review
                counts. It rendered "4.8 - 232 reviews" for a product with no
                reviews behind it. */}
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted">
              {product.version}
            </span>
          </div>
          <h3 className="mt-2 flex items-baseline text-xl font-black tracking-[-0.04em] text-ink transition-colors group-hover:text-accent">
            {/* ponytail: the visible product name is the anchor text. It used
                to be aria-hidden, so Google's link text for all 12 products was
                "View Clarity" instead of "Clarity". */}
            <a
              href={`/store/${product.slug}/`}
              className="absolute inset-0 z-0"
            >
              <span>{product.name}</span>
            </a>
          </h3>
          <p className="mt-2 flex-1 text-sm leading-7 text-ink-muted">{product.description}</p>

          <div className="relative z-10 mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-black tracking-[-0.03em] text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                ${product.price}
              </span>
              <button
                type="button"
                onClick={handleAdd}
                aria-label={added ? `Added ${product.name} to cart` : `Add ${product.name} to cart`}
                className={
                  added
                    ? "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300"
                    : "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-accent transition hover:border-accent hover:bg-accent hover:text-white hover:shadow-[0_0_18px_rgba(0,162,255,0.4)]"
                }
              >
                {added ? <CheckIcon /> : <PlusIcon />}
                {added ? "Added" : "Add"}
              </button>
            </div>
            <div className="mt-3">
              <TrustMicroBar variant="compact" />
            </div>
          </div>
        </div>
      </article>
    </Reveal>
  );
}
