import Button from "./Button";
import GlassCard from "./GlassCard";
import Reveal from "./Reveal";

const principles = [
  "Instant download after purchase",
  "Perpetual license, no subscriptions",
  "Free updates within the major version",
  "Email support and refund guarantee"
];

export default function ContactCTA() {
  return (
    <section id="contact" className="relative overflow-hidden bg-bg-soft/40 py-16 sm:py-20">
      <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-accent-bright/15 blur-3xl" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <GlassCard className="relative overflow-hidden p-6 sm:p-10 lg:p-14">
            <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
            <div className="absolute -left-10 bottom-0 h-60 w-60 rounded-full bg-accent-bright/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-ink-muted">Digital goods store</p>
                <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.06em] text-ink sm:text-6xl">
                  Premium tools that ship once and work forever.
                </h2>
                <ul className="mt-7 grid gap-3 text-base leading-8 text-ink-muted md:grid-cols-2">
                  {principles.map((principle) => (
                    <li key={principle} className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(0,162,255,0.7)]" />
                      <span>{principle}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button href="/store">Browse the store</Button>
                <Button variant="secondary" href="/extras">
                  Free extras
                </Button>
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}
