import Reveal from "./Reveal";

export interface LegalSection {
  title: string;
  body: string[];
  list?: string[];
}

interface LegalPageProps {
  eyebrow: string;
  title: string;
  lead: string;
  lastUpdated: string;
  sections: LegalSection[];
  company?: string;
  jurisdiction?: string;
}

function ContactIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function LegalPage({
  eyebrow,
  title,
  lead,
  lastUpdated,
  sections,
  company = "KRT store",
  jurisdiction = "your local jurisdiction"
}: LegalPageProps) {
  return (
    <Reveal>
      <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <header className="mb-10 border-b border-line pb-8">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-accent">{eyebrow}</p>
          <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">{lead}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">
            <LockIcon />
            <span>Last updated {lastUpdated}</span>
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <nav className="rounded-2xl border border-line bg-surface/60 p-3 text-sm" aria-label="Document contents">
              <p className="px-2 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">Contents</p>
              <ul className="mt-2 space-y-1">
                {sections.map((section) => (
                  <li key={section.title}>
                    <a
                      href={`#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                      className="block rounded-xl px-3 py-2 text-ink-muted transition hover:bg-slate-800/40 hover:text-ink"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-6 rounded-2xl border border-line bg-surface/60 p-4 text-xs text-ink-muted">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink">Questions?</p>
              <a
                href="/#contact"
                className="mt-2 inline-flex items-center gap-2 font-bold text-accent transition hover:text-accent-bright"
              >
                <ContactIcon />
                Contact us
              </a>
            </div>
          </aside>

          <article className="prose prose-invert max-w-none space-y-10">
            {sections.map((section) => {
              const id = section.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              return (
                <section key={section.title} id={id} className="scroll-mt-32 space-y-3">
                  <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">{section.title}</h2>
                  {section.body.map((paragraph, idx) => (
                    <p key={idx} className="text-base leading-8 text-ink-muted">
                      {paragraph}
                    </p>
                  ))}
                  {section.list && (
                    <ul className="ml-1 space-y-2 text-base leading-8 text-ink-muted">
                      {section.list.map((item, idx) => (
                        <li key={idx} className="flex gap-3">
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(0,162,255,0.7)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}

            <section className="rounded-2xl border border-line bg-bg-soft/50 p-5 text-xs text-ink-muted">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink">Plain-language summary</p>
              <p className="mt-2 leading-relaxed">
                This document is a template provided for {company} in {jurisdiction}. Replace the bracketed sections with the language your counsel has reviewed.
              </p>
            </section>
          </article>
        </div>
      </section>
    </Reveal>
  );
}
