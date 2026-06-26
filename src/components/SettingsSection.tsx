import { useState } from "react";
import Button from "./Button";
import Reveal from "./Reveal";

type SectionKey = "account" | "notifications" | "billing" | "data";

interface ToggleProps {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}

function Toggle({ label, description, defaultChecked = false }: ToggleProps) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{label}</p>
        {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
          on ? "border-accent bg-accent" : "border-line bg-surface-ink"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            on ? "left-[1.4rem]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsSection() {
  const [section, setSection] = useState<SectionKey>("account");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const onSave = (label: string) => {
    setSavedNotice(label);
    window.setTimeout(() => setSavedNotice(null), 2000);
  };

  return (
    <Reveal>
      <section className="container mx-auto px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-ink-muted" aria-label="Breadcrumb">
          <a href="/" className="transition hover:text-ink">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/profile" className="transition hover:text-ink">Profile</a>
          <span aria-hidden="true">/</span>
          <span className="text-ink">Settings</span>
        </nav>

        <header className="mb-10 border-b border-line pb-8">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-accent">Settings</p>
          <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-5xl">Account settings.</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-ink-muted">
            Manage your input, notifications, billing, and data. Everything is local-only in this prototype.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <div className="rounded-2xl border border-line bg-surface/60 p-2 text-sm" role="tablist" aria-label="Settings sections">
              <ul className="space-y-1">
                {(
                  [
                    { key: "account", label: "Account" },
                    { key: "notifications", label: "Notifications" },
                    { key: "billing", label: "Billing" },
                    { key: "data", label: "Data & privacy" }
                  ] as { key: SectionKey; label: string }[]
                ).map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={section === item.key}
                      onClick={() => setSection(item.key)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                        section === item.key
                          ? "bg-accent/10 font-black text-accent"
                          : "text-ink-muted hover:bg-slate-800/40 hover:text-ink"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span aria-hidden="true">{section === item.key ? "•" : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <Button variant="secondary" href="/profile" className="w-full justify-center">
                Back to profile
              </Button>
            </div>
          </aside>

          <div className="space-y-8">
            {savedNotice && (
              <p
                role="status"
                className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200"
              >
                {savedNotice}
              </p>
            )}

            {section === "account" && (
              <section className="space-y-4">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Account</h2>
                <p className="text-sm text-ink-muted">
                  Your basic profile and sign-in preferences.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                      Display name
                    </span>
                    <input
                      type="text"
                      defaultValue="Fran"
                      className="h-11 w-full rounded-full border border-line bg-surface/60 px-5 text-sm text-ink outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                      Email address
                    </span>
                    <input
                      type="email"
                      defaultValue="fran@studio.example"
                      autoComplete="off"
                      className="h-11 w-full rounded-full border border-line bg-surface/60 px-5 text-sm text-ink outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                    />
                  </label>
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-bold text-ink">Sign-in method</legend>
                  <label className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink">
                    <input type="radio" name="signin" defaultChecked className="h-4 w-4 cursor-pointer border-line bg-surface text-accent focus:ring-accent" />
                    <span className="flex-1">Magic link by email</span>
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">Active</span>
                  </label>
                </fieldset>
                <div>
                  <Button onClick={() => onSave("Account details saved.")} className="shadow-[0_0_22px_rgba(0,162,255,0.35)]">
                    Save account
                  </Button>
                </div>
              </section>
            )}

            {section === "notifications" && (
              <section className="space-y-4">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Notifications</h2>
                <p className="text-sm text-ink-muted">Decide which emails you get from us.</p>
                <div className="space-y-3">
                  <Toggle
                    label="Product updates"
                    description="Release notes and changelogs for products you've bought."
                    defaultChecked
                  />
                  <Toggle
                    label="Discounts & promotions"
                    description="Occasional store-wide sales. About one email a month."
                  />
                  <Toggle
                    label="New free extras"
                    description="Heads-up when we ship a new item in the free extras library."
                    defaultChecked
                  />
                  <Toggle
                    label="Newsletter"
                    description="The 'Get the newsletter' digest — same as footer signup."
                  />
                </div>
                <div>
                  <Button onClick={() => onSave("Notification preferences saved.")} className="shadow-[0_0_22px_rgba(0,162,255,0.35)]">
                    Save preferences
                  </Button>
                </div>
              </section>
            )}

            {section === "billing" && (
              <section className="space-y-4">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Billing</h2>
                <p className="text-sm text-ink-muted">
                  Payment methods and invoices for purchases.
                </p>
                <article className="rounded-2xl border border-line bg-surface/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">
                        Default method
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink">Card ending •••• 4242</p>
                    </div>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                      Demo
                    </span>
                  </div>
                </article>
                <article className="rounded-2xl border border-line bg-surface/60 p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink-muted">Recent invoices</p>
                  <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                    <li className="flex justify-between border-b border-line/60 py-2">
                      <span>ord_4f9c1a · Clarity + Calm Tokens</span>
                      <a href="/" className="font-black text-accent underline-offset-2 hover:underline">
                        PDF
                      </a>
                    </li>
                    <li className="flex justify-between py-2">
                      <span>ord_77b034 · Atlas template</span>
                      <a href="/" className="font-black text-accent underline-offset-2 hover:underline">
                        PDF
                      </a>
                    </li>
                  </ul>
                </article>
              </section>
            )}

            {section === "data" && (
              <section className="space-y-4">
                <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Data & privacy</h2>
                <p className="text-sm text-ink-muted">
                  Manage what we keep about you. Full read of your data is in{" "}
                  <a href="/privacy" className="font-black text-accent underline-offset-2 hover:underline">
                    Privacy
                  </a>
                  .
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onSave("Account data export requested.")}
                    className="rounded-2xl border border-line bg-surface/60 p-4 text-left transition hover:border-accent/40 hover:bg-surface-bright"
                  >
                    <p className="text-sm font-black text-ink">Download my data</p>
                    <p className="mt-1 text-xs text-ink-muted">Get a JSON export of your account.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete your account? This cannot be undone.")) {
                        onSave("Account deletion requested.");
                      }
                    }}
                    className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-left transition hover:border-red-500/60 hover:bg-red-500/15"
                  >
                    <p className="text-sm font-black text-red-300">Delete account</p>
                    <p className="mt-1 text-xs text-red-200/70">Permanently remove your account and data.</p>
                  </button>
                </div>
              </section>
            )}

            <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-relaxed text-amber-100">
              <strong className="block text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Prototype note</strong>
              All toggles and inputs are local-only. No request is sent to a server. Saving updates the UI briefly and then resets.
            </p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
