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

function LockIcon() {
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
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon() {
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
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
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.34 20.34 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.34 20.34 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
    </svg>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  required = true,
  placeholder,
  autoComplete = "current-password"
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-bold text-ink">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted">
          <LockIcon />
        </span>
        <input
          id={id}
          type={shown ? "text" : "password"}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-full border border-line bg-surface/60 pl-12 pr-12 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-ink-muted transition hover:bg-surface-bright hover:text-ink"
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState<"login" | "signup" | null>(null);

  const trimmedEmail = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const signupLengthOK = password.length >= 8;
  const signupMatchOK = password === confirm;

  const errors: string[] = [];
  if (showErrors) {
    if (!isValidEmail) errors.push("Enter a valid email address.");
    if (mode === "signup" && !signupLengthOK)
      errors.push("Password must be at least 8 characters.");
    if (mode === "signup" && !signupMatchOK)
      errors.push("Passwords do not match.");
    if (mode === "login" && password.length < 1)
      errors.push("Enter your password.");
  }

  const canSubmit =
    isValidEmail &&
    (mode === "login" ? password.length > 0 : signupLengthOK && signupMatchOK);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setShowErrors(true);
    if (!canSubmit) return;
    // Prototype only — no real authentication is performed.
    setSubmitted(mode);
  };

  if (submitted) {
    const isLogin = submitted === "login";
    return (
      <Reveal>
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-10 text-center">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
            {isLogin ? "Signed in" : "Account created"}
          </p>
          <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-4xl">
            {isLogin ? "Welcome back." : "Welcome to the store."}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-ink-muted">
            Signed in as <strong className="text-ink">{trimmedEmail}</strong>. This demo does not create a real session.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/profile">Open profile</Button>
            <Button variant="secondary" href="/store">Browse the store</Button>
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
      ? "Enter the email and password you signed up with."
      : "Pick an email and a password. We'll send a verification link to the address.";
  const cta = mode === "login" ? "Sign in" : "Create account";
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

      <form onSubmit={onSubmit} noValidate className="space-y-6">
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
              onBlur={() => setShowErrors(true)}
              aria-invalid={showErrors && !isValidEmail ? "true" : "false"}
              className="h-12 w-full rounded-full border border-line bg-surface/60 pl-12 pr-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent aria-[invalid=true]:border-red-400/60"
            />
          </div>
        </div>

        <PasswordInput
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {mode === "signup" && (
          <PasswordInput
            id="confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter password"
            autoComplete="new-password"
          />
        )}

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200" role="alert">
            {errors.map((message) => (
              <li key={message}>· {message}</li>
            ))}
          </ul>
        )}

        <Button type="submit" className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]" disabled={showErrors && !canSubmit}>
          {cta}
        </Button>

        <p className="text-sm text-ink-muted">
          {switchPrompt}{" "}
          <a href={switchTarget} className="font-black text-accent transition hover:text-accent-bright">
            {switchLabel} →
          </a>
        </p>
      </form>

      <p className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-relaxed text-amber-100">
        <strong className="block text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Prototype note</strong>
        This is a UI prototype — no real authentication is wired up. On submit the page pretends a sign-in succeeded. In production the password would be hashed with bcrypt or argon2 on the server, never stored in plaintext.
      </p>
    </Reveal>
  );
}
