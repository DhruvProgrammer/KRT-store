import Button from "./Button";
import Reveal from "./Reveal";

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export default function ProfileSection() {
  return (
    <Reveal>
      <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-muted" aria-label="Breadcrumb">
          <a href="/" className="transition hover:text-ink">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/login" className="transition hover:text-ink">Sign in</a>
          <span aria-hidden="true">/</span>
          <span className="text-ink">Profile</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-6 lg:sticky lg:top-32 lg:self-start">
            <nav className="rounded-2xl border border-line bg-surface/60 p-2 text-sm" aria-label="Profile sections">
              <ul className="space-y-1">
                <li>
                  <a
                    href="/login"
                    className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 font-black text-accent"
                  >
                    <UserIcon />
                    <span>Sign in</span>
                  </a>
                </li>
                <li>
                  <a
                    href="/settings"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink-muted transition hover:bg-slate-800/40 hover:text-ink"
                  >
                    <span>Settings</span>
                  </a>
                </li>
              </ul>
            </nav>

            <Button href="/settings" className="w-full justify-center">
              Manage settings
            </Button>
          </aside>

          <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-surface/60 p-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright font-black text-2xl text-white shadow-[0_0_24px_rgba(0,162,255,0.35)]">
              KRT
            </span>
            <h1 className="mt-6 text-3xl font-black tracking-[-0.06em] text-ink sm:text-4xl">
              Sign in to view your profile
            </h1>
            <p className="mt-3 max-w-md text-base leading-7 text-ink-muted">
              Orders, downloads, license keys, and wishlist are stored per account.
              Sign in or create an account to see them.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Button href="/login">Sign in</Button>
              <Button variant="secondary" href="/signup">Create account</Button>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
