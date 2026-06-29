import { useState } from "react";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CopyKeyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-ink px-2 py-1 font-mono text-[11px] text-ink-muted transition hover:border-accent/40 hover:text-ink"
      aria-label={`Copy license key ${value}`}
    >
      <CopyIcon />
      <span>{copied ? "Copied" : value}</span>
    </button>
  );
}

const mockWishlist = [
  { name: "Frontline UI", category: "design-systems", price: 49 },
  { name: "Dash UI Kit", category: "design-systems", price: 54 },
  { name: "Composer plugin", category: "plugins", price: 29 }
];

const mockActivity = [
  { at: "2026-05-21 14:02", label: "Order ord_4f9c1a delivered", kind: "Order" },
  { at: "2026-05-19 09:31", label: "Added 1 download — Atlas template", kind: "Download" },
  { at: "2026-04-02 19:18", label: "Order ord_77b034 delivered", kind: "Order" },
  { at: "2026-03-29 11:05", label: "Account verified", kind: "Security" }
];

const mockLicenses = [
  { id: "krt-CLARITY-AX9", product: "Clarity plugin", issued: "2026-05-21", seats: 1, status: "Active" },
  { id: "krt-CALMTOK-ZE2", product: "Calm Tokens", issued: "2026-05-21", seats: 1, status: "Active" },
  { id: "krt-ATLAS-XJ7", product: "Atlas template", issued: "2026-04-02", seats: 1, status: "Active" }
];

const mockOrders = [
  {
    id: "ord_4f9c1a",
    date: "2026-05-21",
    items: ["Clarity plugin", "Calm Tokens"],
    total: 58,
    status: "Delivered",
    licenseKey: "krt-4f9c1a-ze2k"
  },
  {
    id: "ord_77b034",
    date: "2026-04-02",
    items: ["Atlas template"],
    total: 39,
    status: "Delivered",
    licenseKey: "krt-77b034-xj7p"
  }
];

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
            <div className="rounded-3xl border border-line bg-surface/70 p-6 shadow-soft">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright font-black text-white shadow-[0_0_24px_rgba(0,162,255,0.35)]">
                F
              </span>
              <h2 className="mt-4 text-base font-black tracking-[-0.04em] text-ink">Fran</h2>
              <p className="text-sm text-ink-muted">fran@studio.example</p>
              <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Verified
              </span>
            </div>

            <nav className="rounded-2xl border border-line bg-surface/60 p-2 text-sm" aria-label="Profile sections">
              <ul className="space-y-1">
                <li>
                  <a
                    href="/profile"
                    aria-current="page"
                    className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 font-black text-accent"
                  >
                    <UserIcon />
                    <span>Overview</span>
                  </a>
                </li>
                <li>
                  <a
                    href="/profile?tab=downloads"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink-muted transition hover:bg-slate-800/40 hover:text-ink"
                  >
                    <DownloadIcon />
                    <span>Downloads</span>
                  </a>
                </li>
                <li>
                  <a
                    href="/settings"
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink-muted transition hover:bg-slate-800/40 hover:text-ink"
                  >
                    <KeyIcon />
                    <span>Settings</span>
                  </a>
                </li>
              </ul>
            </nav>

            <div className="space-y-2">
              <Button href="/settings" className="w-full justify-center">
                Manage settings
              </Button>
              <Button variant="secondary" href="/login" className="w-full justify-center">
                Sign out
              </Button>
            </div>
          </aside>

          <div className="space-y-10">
            <header className="border-b border-line pb-6">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-accent">Profile</p>
              <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-5xl">
                Welcome back, Fran.
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-ink-muted">
                Account overview, recent orders, and license keys.
              </p>
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
              <article className="rounded-2xl border border-line bg-surface/70 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">Orders</p>
                <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-ink">{mockOrders.length}</p>
                <p className="mt-1 text-xs text-ink-muted">Lifetime</p>
              </article>
              <article className="rounded-2xl border border-line bg-surface/70 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">Downloads</p>
                <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-ink">3</p>
                <p className="mt-1 text-xs text-ink-muted">Available</p>
              </article>
              <article className="rounded-2xl border border-line bg-surface/70 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">Spent</p>
                <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-accent drop-shadow-[0_0_10px_rgba(0,162,255,0.3)]">$97</p>
                <p className="mt-1 text-xs text-ink-muted">All-time</p>
              </article>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Recent orders</h2>
                <a
                  href="/settings"
                  className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
                >
                  Manage →
                </a>
              </div>
              <ul className="space-y-3">
                {mockOrders.map((order) => (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-line bg-surface/70 p-5 transition hover:border-accent/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
                          Order {order.id}
                        </p>
                        <p className="text-sm font-black text-ink">
                          {order.items.join(", ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                          ${order.total}
                        </p>
                        <p className="text-xs text-ink-muted">{order.date}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="rounded-full border border-line bg-surface/60 px-3 py-1 font-black uppercase tracking-[0.18em] text-ink-muted">
                        {order.status}
                      </span>
                      <code className="rounded-md border border-line bg-surface-ink px-2 py-1 font-mono text-[11px] text-ink-muted">
                        {order.licenseKey}
                      </code>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-black tracking-[-0.05em] text-ink">Downloads</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  { name: "Clarity plugin", version: "v1.4.2", size: "2.3 MB" },
                  { name: "Calm Tokens", version: "v2.4.0", size: "0.8 MB" },
                  { name: "Atlas template", version: "v3.2.0", size: "4.6 MB" }
                ].map((item) => (
                  <li key={item.name} className="rounded-2xl border border-line bg-surface/70 p-4">
                    <p className="text-sm font-black text-ink">{item.name}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {item.version} · {item.size}
                    </p>
                    <a
                      href="/store"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-accent transition hover:text-accent-bright"
                    >
                      <DownloadIcon />
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">License keys</h2>
                <a
                  href="/settings"
                  className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
                >
                  Manage →
                </a>
              </div>
              <div className="overflow-hidden rounded-2xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-ink text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left">Key</th>
                      <th scope="col" className="px-4 py-3 text-left">Product</th>
                      <th scope="col" className="hidden px-4 py-3 text-left sm:table-cell">Issued</th>
                      <th scope="col" className="px-4 py-3 text-left">Seats</th>
                      <th scope="col" className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60 bg-surface/60">
                    {mockLicenses.map((license) => (
                      <tr key={license.id} className="text-ink">
                        <td className="px-4 py-3 align-middle">
                          <CopyKeyButton value={license.id} />
                        </td>
                        <td className="px-4 py-3 text-sm font-bold">{license.product}</td>
                        <td className="hidden px-4 py-3 text-xs text-ink-muted sm:table-cell">{license.issued}</td>
                        <td className="px-4 py-3 text-xs text-ink-muted">{license.seats}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                            {license.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Wishlist</h2>
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">
                  {mockWishlist.length} saved
                </span>
              </div>
              {mockWishlist.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-3">
                  {mockWishlist.map((item) => (
                    <li key={item.name} className="rounded-2xl border border-line bg-surface/70 p-4">
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                          <HeartIcon />
                        </span>
                        <p className="text-sm font-black text-ink">{item.name}</p>
                      </div>
                      <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">
                        {item.category}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-base font-black text-accent drop-shadow-[0_0_8px_rgba(0,162,255,0.25)]">
                          ${item.price}
                        </span>
                        <a
                          href="/store"
                          className="text-xs font-black uppercase tracking-[0.18em] text-ink-muted transition hover:text-accent"
                        >
                          View →
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-6 text-center text-sm text-ink-muted">
                  Your wishlist is empty. Browse the{" "}
                  <a href="/store" className="font-black text-accent transition hover:text-accent-bright">
                    store
                  </a>{" "}
                  to save items.
                </p>
              )}
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-black tracking-[-0.05em] text-ink">Recent activity</h2>
              <ol className="relative space-y-3 rounded-2xl border border-line bg-surface/60 p-4">
                <span aria-hidden="true" className="pointer-events-none absolute left-[1.45rem] top-6 bottom-6 w-px bg-line" />
                {mockActivity.map((entry) => (
                  <li key={entry.at} className="relative flex gap-4 pl-2">
                    <span className="z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/40 bg-bg-soft text-accent">
                      <ActivityIcon />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface-ink/70 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                          {entry.kind}
                        </span>
                        <span className="text-ink-muted">{entry.at}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink">{entry.label}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-2xl border border-line bg-bg-soft/50 p-5">
              <TrustMicroBar variant="full" />
            </section>

            <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-relaxed text-amber-100">
              <strong className="block text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Prototype note</strong>
              Orders and downloads shown here are mock data. In production this page would load purchases from a real account.
            </p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
