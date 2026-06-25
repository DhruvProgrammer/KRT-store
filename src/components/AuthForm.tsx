import { useState } from "react";
import Button from "./Button";
import Reveal from "./Reveal";

export type AuthMode = "login" | "signup";

interface AuthFormProps {
  mode: AuthMode;
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<"login" | "signup" | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmedEmail = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched(true);
    if (!isValidEmail) return;
    // SECURITY: this is a frontend-only prototype. We store nothing — just simulate a submission.
    setSubmitted(mode);
  };

  if (submitted) {
    const isLogin = submitted === "login";
    return (
      <Reveal>
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-10 text-center">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
            {isLogin ? "Magic link sent" : "Account created"}
          </p>
          <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-4xl">
            {isLogin ? "Check your inbox." : "Welcome to the store."}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-ink-muted">
            {isLogin
              ? `If ${trimmedEmail} has an account, we just sent a one-time sign-in link. It expires in 15 minutes.`
              : `We sent a verification link to ${trimmedEmail}. Click it to finish setting up your account.`}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/store">Browse the store</Button>
            <Button variant="secondary" href="/">Back to home</Button>
          </div>
          <p className="mt-6 text-[11px] text-ink-muted">
            Note: this is a frontend prototype — no email is actually sent and no session is created.
          </p>
        </div>
      </Reveal>
    );
  }

  const heading = mode === "login" ? "Sign in with email" : "Create your account";
  const subtitle =
    mode === "login"
      ? "We'll email you a one-time link to sign in. No password to remember."
      : "Use your email to start an account. We'll send a verification link.";
  const cta = mode === "login" ? "Email me a sign-in link" : "Create account";
  const switchPrompt = mode === "login" ? "Don't have an account?" : "Already have an account?";
  const switchTarget = mode === "login" ? "/signup" : "/login";
  const switchLabel = mode === "login" ? "Create account" : "Sign in";

  return (
    <Reveal>
      <header className="mb-8 border-b border-line pb-8">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-accent">
          {mode === "login" ? "Sign in" : "Create account"}
        </p>
        <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-5xl">{heading}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">{subtitle}</p>
      </header>

      <form onSubmit={onSubmit} noValidate className="space-y-6" autoComplete="off">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-bold text-ink">
            Email address
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted">
              <MailIcon />
            </span>
            <input
              id="email"
              type="email"
              required
              placeholder="you@studio.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !isValidEmail ? "true" : "false"}
              className="h-12 w-full rounded-full border border-line bg-surface/60 pl-12 pr-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent aria-[invalid=true]:border-red-400/60"
            />
          </div>
          {touched && !isValidEmail && (
            <p className="mt-2 text-xs font-bold text-red-300">
              Please enter a valid email address.
            </p>
          )}
        </div>

        <Button type="submit" className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]">
          {cta}
        </Button>

        <div className="flex items-center gap-2 text-xs text-ink-muted" aria-hidden="true">
          <ShieldIcon />
          <span>We never store passwords (no password means nothing to leak).</span>
        </div>

        <p className="text-sm text-ink-muted">
          {switchPrompt}{" "}
          <a href={switchTarget} className="font-black text-accent transition hover:text-accent-bright">
            {switchLabel} →
          </a>
        </p>
      </form>

      <p className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-relaxed text-amber-100">
        <strong className="block text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Prototype note</strong>
        This is a UI prototype — no real authentication is wired up. On submit the page pretends to send a magic link. In production, this would call a server endpoint that issues a one-time token, emails it, and verifies it on a callback route.
      </p>
    </Reveal>
  );
}
