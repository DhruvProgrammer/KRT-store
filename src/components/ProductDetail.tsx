import { useState } from "react";
import type { Product } from "../data/products";
import { products } from "../data/products";
import { cart } from "../lib/cart";
import Button from "./Button";
import Stars from "./Stars";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";
import ProductCard from "./ProductCard";

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

function CartIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
  );
}

function DeliveryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h7v8l11-13h-8z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 16.93-3L21 8M21 3v5h-5M21 12a9 9 0 0 1-16.93 3L3 16M3 21v-5h5" />
    </svg>
  );
}

// Five gallery "shots" mocked by re-tinting the gradient with rotation/overlay
function getGallery(gradient: string) {
  return [
    { id: "main", label: "Hero shot", kind: "hero", src: gradient },
    { id: "ui", label: "UI view", kind: "ui", src: gradient },
    { id: "alt", label: "Detail", kind: "alt", src: gradient },
    { id: "mobile", label: "Mobile", kind: "mobile", src: gradient },
    { id: "settings", label: "Settings", kind: "settings", src: gradient }
  ];
}

interface AccordionItemProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}
function AccordionItem({ title, defaultOpen, children }: AccordionItemProps) {
  const [open, setOpen] = useState(!!defaultOpen);
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
          className={`ml-4 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-black text-accent transition ${
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

type LicenseKey = "regular" | "extended" | "team";

interface Variant {
  id: LicenseKey;
  label: string;
  description: string;
  seats: number;
  priceMultiplier: number;
}

const variants: Variant[] = [
  {
    id: "regular",
    label: "Regular",
    description: "Use in one project for yourself or a single client.",
    seats: 1,
    priceMultiplier: 1
  },
  {
    id: "extended",
    label: "Extended",
    description: "Use on multiple projects, or for an entire client studio.",
    seats: 5,
    priceMultiplier: 2.6
  },
  {
    id: "team",
    label: "Team",
    description: "Unlimited seats and priority developer support for one year.",
    seats: 25,
    priceMultiplier: 4.2
  }
];

interface Review {
  id: string;
  author: string;
  initials: string;
  rating: number;
  date: string;
  title: string;
  body: string;
  verifiedBuyer: boolean;
}

function buildReviews(product: Product): Review[] {
  // Seed deterministic reviews from the product slug + rating
  const seedReviews: Review[] = [
    {
      id: "r1",
      author: "Alex M.",
      initials: "AM",
      rating: Math.min(5, Math.round(product.rating)),
      date: "2026-05-04",
      title: "Worth every cent",
      body:
        "Integrated in under an hour. The documentation is clear and the maintainer actually replies.",
      verifiedBuyer: true
    },
    {
      id: "r2",
      author: "Priya N.",
      initials: "PN",
      rating: Math.max(4, Math.min(5, Math.round(product.rating - 0.4))),
      date: "2026-04-19",
      title: "Solid for production",
      body:
        "Run it in a staging environment for a week and there were no surprises. Performance is excellent.",
      verifiedBuyer: true
    },
    {
      id: "r3",
      author: "Tom B.",
      initials: "TB",
      rating: 4,
      date: "2026-03-22",
      title: "Good, with a small caveat",
      body:
        "Works well across browsers. One of the rule sets returned a false positive on our edge case; the team shipped a fix the next week.",
      verifiedBuyer: true
    }
  ];
  return seedReviews;
}

interface ProductDetailProps {
  product: Product;
}

export default function ProductDetail({ product }: ProductDetailProps) {
  const gallery = getGallery(product.gradient);
  const [activeShotId, setActiveShotId] = useState(gallery[0].id);
  const activeShot = gallery.find((shot) => shot.id === activeShotId) ?? gallery[0];

  const [licenseKey, setLicenseKey] = useState<LicenseKey>("regular");
  const variant = variants.find((v) => v.id === licenseKey) ?? variants[0];
  const finalPrice = Math.round(product.price * variant.priceMultiplier);
  const savings = Math.round(finalPrice * 0.4);

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    try {
      for (let i = 0; i < quantity; i += 1) {
        cart.add({
          slug: product.slug,
          name: product.name,
          price: finalPrice,
          gradient: product.gradient,
          tag: `${product.tag} · ${variant.label}`,
          quantity: 1
        });
      }
      setAdded(true);
      window.dispatchEvent(new CustomEvent("krt:open-cart"));
      window.setTimeout(() => setAdded(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const reviews = buildReviews(product);
  const ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const share =
      stars === Math.round(product.rating)
        ? 0.62
        : stars === Math.round(product.rating) - 1 || stars === Math.round(product.rating) + 1
        ? 0.18
        : stars === 5
        ? 0.12
        : stars === 1
        ? 0.04
        : 0.02;
    return { stars, share };
  });

  const related = products
    .filter((p) => p.slug !== product.slug && p.category === product.category)
    .slice(0, 4);
  const fallback = products.filter((p) => p.slug !== product.slug).slice(0, 4);

  return (
    <article>
      {/* TOP: Gallery + Buy box (Amazon-style split) */}
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: gallery */}
        <Reveal>
          <div className="flex gap-3">
            {/* Vertical thumbnail strip */}
            <ul className="hidden w-16 shrink-0 flex-col gap-2 sm:flex" aria-label="Product gallery">
              {gallery.map((shot) => (
                <li key={shot.id}>
                  <button
                    type="button"
                    onClick={() => setActiveShotId(shot.id)}
                    aria-current={activeShotId === shot.id ? "true" : undefined}
                    aria-label={`Show ${shot.label}`}
                    className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition ${
                      activeShotId === shot.id
                        ? "border-accent shadow-[0_0_18px_rgba(0,162,255,0.35)]"
                        : "border-line/70 hover:border-accent/40"
                    }`}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: shot.src,
                        filter: shot.kind === "alt" ? "hue-rotate(45deg) brightness(0.92)" : "none",
                        transform: shot.kind === "settings" ? "scale(1.05) translateY(-4%)" : "none"
                      }}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>

            {/* Main preview */}
            <div className="flex-1">
              <div className="group relative overflow-hidden rounded-[2rem] border border-line bg-bg-soft">
                <div
                  className="aspect-[4/3] sm:aspect-[16/10]"
                  style={{ background: activeShot.src }}
                  role="img"
                  aria-label={`${product.name} preview — ${activeShot.label}`}
                />
                <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(0,162,255,0.7)]" />
                  {activeShot.label}
                </div>
                <button
                  type="button"
                  aria-label="Zoom in"
                  className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50"
                >
                  <ZoomIcon />
                </button>

                {/* Mobile horizontal thumbs */}
                <div className="border-t border-line bg-bg-soft/90 p-2 sm:hidden">
                  <ul className="flex gap-2 overflow-x-auto" aria-label="Product gallery">
                    {gallery.map((shot) => (
                      <li key={shot.id}>
                        <button
                          type="button"
                          onClick={() => setActiveShotId(shot.id)}
                          aria-current={activeShotId === shot.id ? "true" : undefined}
                          className={`block h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                            activeShotId === shot.id ? "border-accent" : "border-line/60"
                          }`}
                        >
                          <div
                            className="h-full w-full"
                            style={{ background: shot.src }}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* RIGHT: Buy box */}
        <div>
          <Reveal delay={0.06}>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-ink-muted">
              {product.tag}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.07em] text-ink sm:text-5xl">
              {product.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
              <Stars value={product.rating} count={product.reviewCount} size="md" />
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">
                · 12-month support · v{product.version}
              </span>
            </div>
            <p className="mt-5 text-base leading-8 text-ink-muted">{product.longDescription}</p>
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
            {/* License picker — visible button group (no dropdown per UX.md) */}
            <fieldset className="mt-8">
              <legend className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                Choose a license
              </legend>
              <div className="space-y-3">
                {variants.map((v) => {
                  const variantPrice = Math.round(product.price * v.priceMultiplier);
                  const active = licenseKey === v.id;
                  return (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
                        active
                          ? "border-accent bg-accent/5 shadow-[0_0_24px_rgba(0,162,255,0.18)]"
                          : "border-line bg-surface/60 hover:border-accent/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="license"
                        value={v.id}
                        checked={active}
                        onChange={() => setLicenseKey(v.id)}
                        className="mt-1 h-4 w-4 cursor-pointer border-line bg-surface text-accent focus:ring-accent"
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-base font-black tracking-[-0.03em] text-ink">
                            {v.label}
                          </span>
                          <span className="text-base font-black tracking-[-0.03em] text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                            ${variantPrice}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs text-ink-muted">
                          {v.description} {v.seats > 1 ? `· ${v.seats} seats` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Quantity + Add to cart */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                className="flex items-center gap-2 rounded-2xl border border-line bg-surface/60 px-3 py-2 text-sm"
                aria-label="Quantity"
              >
                <span className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                  Qty
                </span>
                <select
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value))))}
                  className="bg-transparent text-base font-black text-ink outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                onClick={handleAdd}
                className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.45)]"
              >
                {added ? (
                  <>
                    <CheckIcon />
                    <span className="ml-2">Added to cart</span>
                  </>
                ) : (
                  <>
                    <CartIcon />
                    <span className="ml-2">Add to cart · ${finalPrice * quantity}</span>
                  </>
                )}
              </Button>
              <Button variant="secondary" href="/cart" className="w-full justify-center">
                View cart
              </Button>
            </div>

            <div className="mt-6 rounded-2xl border border-line bg-surface/70 p-5">
              <ul className="space-y-3 text-sm text-ink-muted">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-accent">
                    <DeliveryIcon />
                  </span>
                  <span>
                    <strong className="block text-ink">Instant digital download</strong>
                    License key emailed within minutes — no shipping, no waiting.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-accent">
                    <RefreshIcon />
                  </span>
                  <span>
                    <strong className="block text-ink">Lifetime updates</strong>
                    Receive every release within the major version, free forever.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-accent">
                    <ShieldIcon />
                  </span>
                  <span>
                    <strong className="block text-ink">30-day refund</strong>
                    Don't love it? Email within 30 days for a full refund.
                  </span>
                </li>
              </ul>
              <div className="mt-5 border-t border-line pt-4">
                <TrustMicroBar variant="full" />
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Bundle banner */}
      <Reveal>
        <aside className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/15 to-accent-bright/10 p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
              Bundle deal · save {savings === 0 ? "20%" : `${Math.round((savings / Math.max(1, product.price * 4.2)) * 100)}%`}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-ink">
              The full KRT store Bundle
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Get {product.name} plus every plugin, template, and design system in one purchase.
            </p>
          </div>
          <Button href="/#bundle" className="shadow-[0_0_22px_rgba(0,162,255,0.35)]">
            Get the bundle
          </Button>
        </aside>
      </Reveal>

      {/* Specs + Tabs */}
      <Reveal delay={0.2}>
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="mb-6 text-2xl font-black tracking-[-0.06em] text-ink">Product details</h2>
          <div className="border-t border-line">
            <AccordionItem title="Description" defaultOpen>
              <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{product.longDescription}</p>
            </AccordionItem>
            <AccordionItem title={`Features (${product.features.length})`} defaultOpen>
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
            </AccordionItem>
            <AccordionItem title="Specifications">
              <table className="w-full max-w-3xl text-sm">
                <tbody className="divide-y divide-line/60">
                  <tr>
                    <th scope="row" className="w-40 py-2 text-left text-ink-muted">Version</th>
                    <td className="py-2 text-ink">{product.version}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left text-ink-muted">File size</th>
                    <td className="py-2 text-ink">{product.fileSize}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left text-ink-muted">Format</th>
                    <td className="py-2 text-ink">Digital · ZIP archive</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left text-ink-muted">License</th>
                    <td className="py-2 text-ink">Regular / Extended / Team</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left text-ink-muted">Category</th>
                    <td className="py-2 text-ink capitalize">{product.category}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-left text-ink-muted">Compatibility</th>
                    <td className="py-2 text-ink">{product.compatibility.join(", ")}</td>
                  </tr>
                </tbody>
              </table>
            </AccordionItem>
            <AccordionItem title="Changelog">
              <ul className="space-y-3 text-sm text-ink-muted">
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-accent">
                    Latest
                  </span>
                  <div>
                    <p className="font-black text-ink">{product.version}</p>
                    <p>Performance pass, accessibility fixes, refreshed documentation.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-ink-muted">
                    Prior
                  </span>
                  <div>
                    <p className="font-black text-ink">Previous minor</p>
                    <p>Adds a new preset, ensures compatibility with edge-case environments.</p>
                  </div>
                </li>
              </ul>
            </AccordionItem>
            <AccordionItem title="Support & documentation">
              <p className="max-w-3xl text-sm text-ink-muted">
                48-hour response on business days. A complete knowledge base ships with the download. Migration guides and example projects are linked from the README.
              </p>
            </AccordionItem>
            <AccordionItem title="Frequently asked questions">
              <div className="grid max-w-3xl gap-4">
                <div>
                  <p className="text-sm font-bold text-ink">Can I use this on client projects?</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    The Regular license covers a single project. The Extended and Team licenses cover studios and client work — pick a variant above.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">How long does download take?</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Instant. You'll receive a license key via email and a direct download link as soon as payment clears.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">What if my environment breaks?</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Email us. We've tested across Chrome, Firefox, Safari, and Edge on macOS, Windows, and Linux.
                  </p>
                </div>
              </div>
            </AccordionItem>
          </div>
        </section>
      </Reveal>

      {/* Reviews */}
      <Reveal delay={0.2}>
        <section className="mt-16 border-t border-line pt-10">
          <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.06em] text-ink">Customer reviews</h2>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-5xl font-black tracking-[-0.05em] text-ink">
                  {product.rating.toFixed(1)}
                </span>
                <div className="space-y-1 text-sm text-ink-muted">
                  <Stars value={product.rating} size="md" />
                  <p>{product.reviewCount.toLocaleString()} ratings</p>
                </div>
              </div>
              <dl className="mt-6 space-y-2">
                {ratingBreakdown.map((row) => (
                  <div key={row.stars} className="flex items-center gap-3 text-xs text-ink-muted">
                    <dt className="w-12 shrink-0 font-black text-ink">{row.stars} star</dt>
                    <dd className="h-2 flex-1 overflow-hidden rounded-full bg-line/40">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${Math.round(row.share * 100)}%` }}
                      />
                    </dd>
                    <span className="w-10 text-right">{Math.round(row.share * 100)}%</span>
                  </div>
                ))}
              </dl>
              <a
                href="#reviews"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-accent/40 hover:text-accent"
              >
                Write a review →
              </a>
            </div>

            <ul className="space-y-4" id="reviews">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-2xl border border-line bg-surface/60 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-bright font-black text-ink-inverse">
                      {review.initials}
                    </span>
                    <div className="text-sm">
                      <p className="font-black text-ink">{review.author}</p>
                      <p className="text-xs text-ink-muted">{review.date}</p>
                    </div>
                    {review.verifiedBuyer && (
                      <span className="ml-auto rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                        Verified buyer
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <Stars value={review.rating} size="sm" />
                    <p className="mt-2 text-sm font-black text-ink">{review.title}</p>
                    <p className="mt-2 text-sm leading-7 text-ink-muted">{review.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      {/* Related products */}
      <section className="mt-16 border-t border-line pt-10">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
              Customers also bought
            </p>
            <h2 className="text-2xl font-black tracking-[-0.06em] text-ink">Related products</h2>
          </div>
          <a
            href="/store"
            className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
          >
            View all →
          </a>
        </div>
        {related.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.slug} product={item} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fallback.map((item) => (
              <ProductCard key={item.slug} product={item} />
            ))}
          </div>
        )}
      </section>

      {/* Repeat CTA per UX.md §9 */}
      <section className="mt-16 rounded-3xl border border-line bg-bg-soft/50 p-8 text-center sm:p-12">
        <h2 className="mt-3 text-2xl font-black tracking-[-0.05em] text-ink sm:text-3xl">
          Ready to ship {product.name}?
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Instant download. Lifetime updates. 30-day refund.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={handleAdd}>Add to cart · ${finalPrice * quantity}</Button>
          <Button variant="secondary" href="/store">Keep browsing</Button>
        </div>
      </section>
    </article>
  );
}
