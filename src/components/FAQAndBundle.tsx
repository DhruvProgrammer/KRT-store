import Reveal from "./Reveal";
import Button from "./Button";
import { REFUND_POLICY, UPDATE_POLICY, SUPPORT_POLICY } from "../data/policy";
import { LICENSE_TIERS } from "../data/licenses";
import { products, productsRetailTotal } from "../data/products";

// ponytail: the answers are generated from the shared policy so the FAQ, the
// announcement bar, the trust bar, the product page and the Terms of Service
// cannot contradict each other. They did: the marketing promised a
// "no-questions-asked" refund and "lifetime updates" while the terms said
// "only if it doesn't work and we can't fix it" and "within the same major
// version".
const faqs = [
  {
    question: "Do I get future updates?",
    answer: `${UPDATE_POLICY.sentence} You will be notified by email when a new version is released.`
  },
  {
    question: "Can I use these on multiple sites?",
    answer: `Each purchase comes with a licence tier. ${LICENSE_TIERS[0].permits} ${LICENSE_TIERS[1].permits} ${LICENSE_TIERS[2].permits} You choose your tier on the product page before you buy.`
  },
  {
    question: "What's your refund policy?",
    answer: `${REFUND_POLICY.sentence} We want you to love what you build.`
  },
  {
    question: "Is technical support included?",
    answer: `Yes. Every customer gets direct access to human support. ${SUPPORT_POLICY.response}`
  }
];

// ponytail: the reference price was a hardcoded $249 while the catalogue
// totals more than that. It is now the real sum of every product.
const BUNDLE_PRICE = 149;
const bundleRetail = productsRetailTotal;
const bundleSavings = Math.round((1 - BUNDLE_PRICE / bundleRetail) * 100);
const bundleProductCount = products.length;

export default function FAQAndBundle() {
  return (
    <section id="faq" className="border-y border-line/40 bg-bg-soft/50 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          {/* Bundle Column */}
          <Reveal>
            <div id="bundle" className="relative overflow-hidden rounded-[1.5rem] border border-accent/30 bg-gradient-to-br from-[#0b2545] via-[#0c1e3a] to-surface p-8 shadow-[0_24px_60px_rgba(0,30,80,0.45)] sm:p-10">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
              <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-accent-bright/20 blur-3xl" />
              <div className="relative">
                <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-bright/40 bg-accent-bright/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-accent-bright">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-bright shadow-[0_0_10px_rgba(56,189,248,0.7)]" />
                  Save {bundleSavings}% Off
                </span>
                <h2 className="text-3xl font-black tracking-[-0.05em] text-ink sm:text-4xl">
                  Get the full KRT store Bundle
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                  Every plugin, template, design token set, and icon pack we make — all {bundleProductCount} products. Get immediate access to all current releases, {UPDATE_POLICY.short.toLowerCase()}, and priority developer support with one simple payment.
                </p>
                <div className="mt-8 flex items-baseline gap-2">
                  <span className="text-4xl font-black tracking-[-0.04em] text-ink">${BUNDLE_PRICE}</span>
                  <span className="text-sm font-semibold text-ink-muted line-through">${bundleRetail}</span>
                  <span className="ml-1 text-xs font-black uppercase tracking-wider text-accent">One-time payment</span>
                </div>
                <div className="mt-8">
                  <Button
                    href="/store/"
                    className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.5)]"
                  >
                    Purchase the Bundle
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>

          {/* FAQ Column */}
          <Reveal delay={0.1}>
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.28em] text-ink-muted">FAQ</p>
              <h2 className="mb-8 text-3xl font-black tracking-[-0.06em] text-ink sm:text-4xl">
                Frequently asked questions.
              </h2>
              <div className="border-t border-line">
                {faqs.map((faq) => (
                  <details key={faq.question} className="group border-b border-line py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-ink transition hover:text-accent-bright sm:text-lg [&::-webkit-details-marker]:hidden">
                      <span>{faq.question}</span>
                      <span aria-hidden="true" className="ml-4 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-black text-accent transition group-open:rotate-45 group-open:bg-accent/20 group-open:shadow-[0_0_18px_rgba(0,162,255,0.4)]">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}