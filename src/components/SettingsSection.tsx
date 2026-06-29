import { useState } from "react";
import Button from "./Button";
import Reveal from "./Reveal";

type SectionKey = "account" | "notifications" | "billing" | "data";

interface StoredCard {
  id: string;
  brand: "visa" | "mastercard" | "amex" | "unknown";
  last4: string;
  expMonth: string;
  expYear: string;
  holder: string;
  isDefault: boolean;
}

function detectBrand(num: string): StoredCard["brand"] {
  const digits = num.replace(/\D/g, "");
  if (/^4/.test(digits)) return "visa";
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  return "unknown";
}

function CardBrandMark({ brand }: { brand: StoredCard["brand"] }) {
  const labels: Record<StoredCard["brand"], string> = {
    visa: "VISA",
    mastercard: "MC",
    amex: "AMEX",
    unknown: "CARD"
  };
  return (
    <span className="inline-flex h-7 min-w-[3rem] items-center justify-center rounded-md border border-accent/40 bg-accent/10 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-accent">
      {labels[brand]}
    </span>
  );
}

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
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const [cardDraft, setCardDraft] = useState({
    holder: "",
    number: "",
    expMonth: "",
    expYear: "",
    cvc: ""
  });
  const [cardErrors, setCardErrors] = useState<string[]>([]);

  const closeCardForm = () => {
    setAddingCard(false);
    setCardErrors([]);
    setCardDraft({ holder: "", number: "", expMonth: "", expYear: "", cvc: "" });
  };

  const handleSaveCard = () => {
    const errors: string[] = [];
    const digits = cardDraft.number.replace(/\D/g, "");
    const holderOK = cardDraft.holder.trim().length >= 2 && cardDraft.holder.length <= 60;
    const numberOK = digits.length >= 13 && digits.length <= 19;
    const monthOK = /^(0?[1-9]|1[0-2])$/.test(cardDraft.expMonth);
    const yearOK = /^\d{2}$/.test(cardDraft.expYear);
    const cvcOK = /^\d{3,4}$/.test(cardDraft.cvc);

    if (!holderOK) errors.push("Cardholder name must be 2–60 characters.");
    if (!numberOK) errors.push("Card number must be 13–19 digits.");
    if (!monthOK) errors.push("Expiry month must be 01–12.");
    if (!yearOK) errors.push("Expiry year must be 2 digits.");
    if (!cvcOK) errors.push("CVC must be 3–4 digits.");
    if (
      monthOK &&
      yearOK &&
      parseInt(cardDraft.expYear, 10) < new Date().getFullYear() % 100
    ) {
      errors.push("That card has already expired.");
    }

    setCardErrors(errors);
    if (errors.length > 0) return;

    const newCard: StoredCard = {
      id: `card_${Math.random().toString(36).slice(2, 10)}`,
      brand: detectBrand(cardDraft.number),
      last4: digits.slice(-4),
      expMonth: cardDraft.expMonth.padStart(2, "0"),
      expYear: `20${cardDraft.expYear}`,
      holder: cardDraft.holder.trim(),
      isDefault: cards.length === 0
    };

    setCards((prev) => [...prev, newCard]);
    closeCardForm();
    setSavedNotice(
      newCard.brand === "unknown"
        ? "Card saved locally."
        : `${newCard.brand.toUpperCase()} ending ${newCard.last4} saved to your wallet.`
    );
    window.setTimeout(() => setSavedNotice(null), 2600);
  };

  const setCardAsDefault = (id: string) => {
    setCards((prev) => prev.map((card) => ({ ...card, isDefault: card.id === id })));
  };

  const removeCard = (id: string) => {
    const target = cards.find((c) => c.id === id);
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (target?.isDefault && next.length > 0) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-black tracking-[-0.05em] text-ink">Billing</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      Payment methods and invoices for purchases.
                    </p>
                  </div>
                  <Button
                    onClick={() => setAddingCard(true)}
                    disabled={addingCard}
                    className="shadow-[0_0_22px_rgba(0,162,255,0.35)]"
                  >
                    + Add card
                  </Button>
                </div>

                {addingCard && (
                  <article className="rounded-2xl border border-accent/30 bg-bg-soft/70 p-5 shadow-soft">
                    <header className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                          New payment method
                        </p>
                        <p className="mt-1 text-base font-black tracking-[-0.04em] text-ink">
                          Add a card to your wallet
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeCardForm}
                        aria-label="Close add card form"
                        className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-ink text-ink-muted transition hover:bg-surface-bright hover:text-ink"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </header>

                    <fieldset>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                          <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                            Cardholder name
                          </span>
                          <input
                            type="text"
                            autoComplete="cc-name"
                            placeholder="Jane Doe"
                            value={cardDraft.holder}
                            onChange={(e) => setCardDraft((d) => ({ ...d, holder: e.target.value }))}
                            className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                            Card number
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-number"
                            placeholder="4242 4242 4242 4242"
                            value={cardDraft.number}
                            onChange={(e) =>
                              setCardDraft((d) => ({ ...d, number: e.target.value }))
                            }
                            className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 font-mono text-sm tracking-wider text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                            Exp month
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-exp-month"
                            placeholder="MM"
                            maxLength={2}
                            value={cardDraft.expMonth}
                            onChange={(e) =>
                              setCardDraft((d) => ({ ...d, expMonth: e.target.value.replace(/\D/g, "") }))
                            }
                            className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 text-center font-mono text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                            Exp year
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-exp-year"
                            placeholder="YY"
                            maxLength={2}
                            value={cardDraft.expYear}
                            onChange={(e) =>
                              setCardDraft((d) => ({ ...d, expYear: e.target.value.replace(/\D/g, "") }))
                            }
                            className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 text-center font-mono text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                          />
                        </label>
                        <label className="block sm:col-span-2 sm:max-w-[12rem]">
                          <span className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-ink-muted">
                            CVC
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            placeholder="123"
                            maxLength={4}
                            value={cardDraft.cvc}
                            onChange={(e) =>
                              setCardDraft((d) => ({ ...d, cvc: e.target.value.replace(/\D/g, "") }))
                            }
                            className="h-11 w-full rounded-full border border-line bg-surface/70 px-5 text-center font-mono text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
                          />
                        </label>
                      </div>

                      {cardErrors.length > 0 && (
                        <ul role="alert" className="mt-4 space-y-1 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                          {cardErrors.map((message) => (
                            <li key={message}>· {message}</li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                        Cards are validated client-side and stored only in this prototype. No
                        request is sent to a server.
                      </p>

                      <div className="mt-5 flex flex-wrap items-center gap-2">
                        <Button onClick={handleSaveCard} className="shadow-[0_0_22px_rgba(0,162,255,0.35)]">
                          Save card
                        </Button>
                        <Button variant="secondary" onClick={closeCardForm}>
                          Cancel
                        </Button>
                      </div>
                    </fieldset>
                  </article>
                )}

                {cards.length === 0 ? (
                  <article className="rounded-2xl border border-dashed border-line bg-bg-soft/40 p-10 text-center">
                    <p className="text-base font-black text-ink">No payment methods yet.</p>
                    <p className="mt-2 text-sm text-ink-muted">
                      Add a card to make checkout faster next time. Cards are stored
                      locally on this device in this prototype.
                    </p>
                    {!addingCard && (
                      <button
                        type="button"
                        onClick={() => setAddingCard(true)}
                        className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(0,162,255,0.35)] transition hover:bg-accent-bright"
                      >
                        + Add your first card
                      </button>
                    )}
                  </article>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {cards.map((card) => (
                      <li
                        key={card.id}
                        className={`rounded-2xl border p-4 transition ${
                          card.isDefault
                            ? "border-accent/60 bg-accent/5 shadow-[0_0_24px_rgba(0,162,255,0.18)]"
                            : "border-line bg-surface/70 hover:border-accent/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <CardBrandMark brand={card.brand} />
                            {card.isDefault && (
                              <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
                                Default
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-ink-muted">
                            exp {card.expMonth}/{card.expYear.slice(-2)}
                          </span>
                        </div>
                        <p className="mt-3 text-base font-black tracking-[-0.04em] text-ink">
                          •••• •••• •••• {card.last4}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">{card.holder}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {!card.isDefault && (
                            <button
                              type="button"
                              onClick={() => setCardAsDefault(card.id)}
                              className="rounded-full border border-line bg-surface px-3 py-1 font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-accent/40 hover:text-accent"
                            >
                              Set as default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCard(card.id)}
                            className="rounded-full border border-line bg-surface px-3 py-1 font-black uppercase tracking-[0.18em] text-ink-muted transition hover:border-red-500/40 hover:text-red-400"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

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
