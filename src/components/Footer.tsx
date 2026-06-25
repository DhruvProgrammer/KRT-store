const linkGroups = [
  {
    title: "Shop",
    links: [
      { href: "/store", label: "Store" },
      { href: "/extras", label: "Free extras" },
      { href: "/", label: "Home" }
    ]
  },
  {
    title: "Help",
    links: [
      { href: "/#contact", label: "Contact" },
      { href: "mailto:hello@krt.example", label: "Email support" },
      { href: "/#faq", label: "FAQ" },
      { href: "/#bundle", label: "Bundle deal" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/", label: "About KRT store" },
      { href: "/", label: "License terms" },
      { href: "/", label: "Refund policy" },
      { href: "/", label: "Privacy" }
    ]
  }
];

export default function Footer() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="border-b border-line/60">
        <div className="container mx-auto grid gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-14 lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-accent">Stay in the loop</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.05em] text-ink sm:text-3xl">Get the newsletter.</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              Quiet product launches, occasional discounts, and shipping notes. No spam — about one email a month.
            </p>
          </div>
          <form
            className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center lg:justify-self-end"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="sr-only" htmlFor="newsletter-email">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              required
              placeholder="you@studio.com"
              className="h-12 w-full rounded-full border border-line bg-surface-ink px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
            />
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-5 text-sm font-black text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright hover:shadow-[0_0_30px_rgba(0,162,255,0.55)] sm:shrink-0"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div className="container mx-auto grid gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))] lg:gap-12 lg:py-16 lg:px-8">
        <div>
          <a
            href="/"
            class="inline-flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-slate-800/40"
            aria-label="KRT store home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-black text-ink-inverse shadow-[0_0_18px_rgba(0,162,255,0.45)]">
              K
            </span>
            <span className="text-base font-black tracking-[-0.04em] text-ink">KRT store</span>
          </a>
          <p className="mt-5 max-w-xs text-sm leading-7 text-ink-muted">
            Premium plugins, templates, and design assets crafted for designers and engineers who care about
            craft. Pay once, own forever, update free.
          </p>
        </div>

        {linkGroups.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-ink-muted">{group.title}</p>
            <ul className="mt-4 space-y-3 text-sm">
              {group.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-ink-muted transition hover:text-ink">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line/60">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 KRT. Crafted with Inter, Tailwind, and Astro.</p>
          <div className="flex flex-wrap gap-4">
            <a href="/" className="transition hover:text-ink">License</a>
            <a href="/" className="transition hover:text-ink">Privacy</a>
            <a href="/" className="transition hover:text-ink">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
