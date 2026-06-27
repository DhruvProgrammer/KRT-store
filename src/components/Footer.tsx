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
      { href: "/#faq", label: "FAQ" },
      { href: "/#bundle", label: "Bundle deal" }
    ]
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Create account" },
      { href: "/profile", label: "Profile" },
      { href: "/settings", label: "Settings" },
      { href: "/cart", label: "Cart" },
      { href: "/checkout", label: "Checkout" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "/", label: "About KRT store" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms of service" }
    ]
  }
];

export default function Footer() {
  return (
    <footer className="border-t border-line bg-bg-soft">
      <div className="container mx-auto grid gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_repeat(4,minmax(0,1fr))] lg:gap-10 lg:py-16 lg:px-8">
        <div>
          <a
            href="/"
            className="inline-flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-slate-800/40"
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
          <p>© 2026 KRT store. Crafted with Inter, Tailwind, and Astro.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="/privacy" className="transition hover:text-ink">Privacy</a>
            <a href="/terms" className="transition hover:text-ink">Terms</a>
            <a href="/#contact" className="transition hover:text-ink">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
