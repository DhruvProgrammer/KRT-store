import { useState } from "react";
import Reveal from "./Reveal";
import Button from "./Button";

interface FAQItemProps {
  question: string;
  answer: string;
}

function FAQItem({ question, answer }: FAQItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group border-b border-line py-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left font-bold text-ink transition hover:text-accent-bright"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="text-base sm:text-lg">{question}</span>
        <span
          className={`ml-4 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-black text-accent transition ${
            isOpen ? "rotate-45 bg-accent/20 shadow-[0_0_18px_rgba(0,162,255,0.4)]" : ""
          }`}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQAndBundle() {
  const faqs = [
    {
      question: "Do I get future updates?",
      answer: "Yes — every purchase includes lifetime updates at no extra cost. You will be notified via email when a new version is released."
    },
    {
      question: "Can I use these on multiple sites?",
      answer: "Each standard license covers usage for one project/site. If you need to use them on multiple client sites or in unlimited projects, developer and agency licenses are available at checkout."
    },
    {
      question: "What's your refund policy?",
      answer: "Not happy with your purchase? Email us within 30 days of purchase for a full, no-questions-asked refund. We want you to love what you build."
    },
    {
      question: "Is technical support included?",
      answer: "Absolutely. We pride ourselves on fast, helpful, human-led support. Every customer gets direct access to help, with replies guaranteed within 24 hours."
    }
  ];

  return (
    <section className="border-y border-line/40 bg-bg-soft/50 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          {/* Bundle Column */}
          <Reveal>
            <div className="relative overflow-hidden rounded-[1.5rem] border border-accent/30 bg-gradient-to-br from-[#0b2545] via-[#0c1e3a] to-surface p-8 shadow-[0_24px_60px_rgba(0,30,80,0.45)] sm:p-10">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
              <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-accent-bright/20 blur-3xl" />
              <div className="relative">
                <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-bright/40 bg-accent-bright/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-accent-bright">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-bright shadow-[0_0_10px_rgba(56,189,248,0.7)]" />
                  Save 40% Off
                </span>
                <h3 className="text-3xl font-black tracking-[-0.05em] text-ink sm:text-4xl">
                  Get the full KRT store Bundle
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                  Every plugin, theme, design token set, and icon pack we make. Get immediate access to all current releases, lifetime updates, and priority developer support with one simple payment.
                </p>
                <div className="mt-8 flex items-baseline gap-2">
                  <span className="text-4xl font-black tracking-[-0.04em] text-ink">$149</span>
                  <span className="text-sm font-semibold text-ink-muted line-through">$249</span>
                  <span className="ml-1 text-xs font-black uppercase tracking-wider text-accent">One-time payment</span>
                </div>
                <div className="mt-8">
                  <Button
                    href="/store"
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
                {faqs.map((faq, i) => (
                  <FAQItem key={i} question={faq.question} answer={faq.answer} />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
