import { useState, useEffect } from "react";
import Button from "./Button";
import Reveal from "./Reveal";
import TrustMicroBar from "./TrustMicroBar";

function MailIcon() {
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

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.34 20.34 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.34 20.34 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 text-amber-400">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="9" x2="19" y2="9" />
      <line x1="22" y1="6" x2="22" y2="6" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

const inputClass = "h-12 w-full rounded-full border border-line bg-surface/60 pl-12 pr-5 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent aria-[invalid=true]:border-red-400/60";

export type AuthMode = "login" | "signup" | "otp" | "verify";

interface AuthFormProps {
  mode: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
}

const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3001";

export default function AuthForm({ mode: initialMode, onModeChange }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState<"login" | "signup" | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // OTP flow state
  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  useEffect(() => {
    if (otpResendCooldown > 0) {
      const timer = setInterval(() => setOtpResendCooldown(c => c - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [otpResendCooldown]);

  const trimmedEmail = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const signupLengthOK = password.length >= 8;
  const signupMatchOK = password === confirm;
  const firstNameOK = firstName.trim().length > 0;

  const errors: string[] = [];
  if (showErrors) {
    if (!isValidEmail) errors.push("Enter a valid email address.");
    if (mode === "signup" && !signupLengthOK) errors.push("Password must be at least 8 characters.");
    if (mode === "signup" && !signupMatchOK) errors.push("Passwords do not match.");
    if (mode === "login" && password.length < 1) errors.push("Enter your password.");
    if (otpMode && !firstNameOK) errors.push("First name is required.");
  }

  const canSubmit =
    isValidEmail &&
    (mode === "login" ? password.length > 0 : 
      mode === "otp" ? otp.length === 6 :
      signupLengthOK && signupMatchOK && firstNameOK);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setShowErrors(true);
    setErrorMessage("");
    if (!canSubmit || loading) return;

    setLoading(true);

    try {
      if (mode === "login") {
        const res = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        setSubmitted("login");
      } else if (otpMode && !otpSent) {
        // Send OTP
        const res = await fetch(`${API_URL}/api/auth/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, purpose: "registration" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send OTP");
        setOtpSent(true);
        setOtpResendCooldown(60);
      } else if (otpMode && otpSent && mode !== "verify") {
        // Verify OTP
        const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, otp, purpose: "registration" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid OTP");
        // Switch to registration form with verified email
        setMode("signup");
      } else if (mode === "signup") {
        // Full registration with OTP
        const res = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
            first_name: firstName,
            last_name: lastName,
            phone: phone || undefined,
            rating: rating || undefined,
            otp,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        setSubmitted("signup");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    setShowErrors(true);
    if (!isValidEmail) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, purpose: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");
      setOtpMode(true);
      setOtpSent(true);
      setOtpResendCooldown(60);
      setErrorMessage("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (otpResendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, purpose: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend OTP");
      setOtpResendCooldown(60);
      setErrorMessage("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setShowErrors(true);
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, otp, purpose: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid OTP");
      // OTP verified, now show registration form with verified email
      setOtpMode(false);
      setMode("signup");
      setErrorMessage("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setShowErrors(true);
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          first_name: firstName,
          last_name: lastName || undefined,
          phone: phone || undefined,
          rating: rating || undefined,
          otp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setSubmitted("signup");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setShowErrors(true);
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setSubmitted("login");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else if (otpMode && !otpSent) sendOtp();
    else if (otpMode && otpSent) verifyOtp();
    else if (mode === "signup") handleSignup();
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
            Signed in as <strong className="text-ink">{trimmedEmail}</strong>.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/profile">Open profile</Button>
            <Button variant="secondary" href="/store">Browse the store</Button>
          </div>
        </div>
      </Reveal>
    );
  }

  // OTP Input Component
  function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            type="text"
            maxLength={1}
            value={value[i] || ""}
            onChange={(e) => {
              const next = value.slice(0, i) + e.target.value + value.slice(i + 1);
              onChange(next);
              if (e.target.value && i < 5) {
                (document.getElementById(`otp-${i + 1}`) as HTMLInputElement)?.focus();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !e.currentTarget.value && i > 0) {
                (document.getElementById(`otp-${i - 1}`) as HTMLInputElement)?.focus();
              }
            }}
            id={`otp-${i}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            className="h-12 w-12 sm:w-14 rounded-xl border border-line bg-surface/60 text-center text-2xl font-black text-ink outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
            autoComplete="one-time-code"
          />
        ))}
    </div>
  );
}

function PasswordInput({ ... }: { ... }) {
  // ... existing PasswordInput component
  const [shown, setShown] = useState(false);
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-bold text-ink">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted"><LockIcon /></span>
        <input id={id} type={shown ? "text" : "password"} required={required} placeholder={placeholder} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-full border border-line bg-surface/60 pl-12 pr-12 text-sm text-ink placeholder-ink-muted outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent" />
        <button type="button" onClick={() => setShown(v => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-ink-muted transition hover:bg-surface-bright hover:text-ink">{shown ? <EyeOffIcon /> : <EyeIcon />}</button>
      </div>
    </label>
  );
}

function RatingStars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rate our website">
      {Array.from({ length: 5 }).map((_, i) => (
        <button key={i} type="button" onClick={() => onChange(i + 1)} aria-label={`${i + 1} star${i > 0 ? "s" : ""}`}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-surface/40"
          aria-pressed={i < value}
        >
          <StarIcon className={`h-5 w-5 ${i < value ? "text-amber-400" : "text-ink-muted"}`} />
        </button>
      )}
    </div>
  );
}

export default function AuthForm({ mode: initialMode }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "signup" | "otp">(initialMode);
  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [rating, setRating] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState<"login" | "signup" | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (otpResendCooldown > 0) {
      const timer = setInterval(() => setOtpResendCooldown(c => c - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [otpResendCooldown]);

  const trimmedEmail = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const signupLengthOK = password.length >= 8;
  const signupMatchOK = password === confirm;
  const firstNameOK = firstName.trim().length > 0;

  const errors: string[] = [];
  if (showErrors) {
    if (!isValidEmail) errors.push("Enter a valid email address.");
    if (mode === "signup" && !signupLengthOK) errors.push("Password must be at least 8 characters.");
    if (mode === "signup" && !signupMatchOK) errors.push("Passwords do not match.");
    if (mode === "login" && password.length < 1) errors.push("Enter your password.");
    if (mode === "signup" && !firstNameOK) errors.push("First name is required.");
  }

  const canSubmit = isValidEmail && (mode === "login" ? password.length > 0 : mode === "signup" ? signupLengthOK && signupMatchOK && firstNameOK : otp.length === 6);

  const heading = mode === "login" ? "Sign in" : otpMode ? "Verify your email" : "Create your account";
  const subtitle = mode === "login" ? "Enter the email and password you signed up with." : otpMode ? "We've sent a 6-digit code to your email." : "Enter your details. We'll send a verification code to your email.";
  const cta = mode === "login" ? "Sign in" : otpMode ? (otpSent ? "Verify code" : "Send code") : "Create account";
  const switchPrompt = mode === "login" ? "Don't have an account?" : otpMode ? "Back to login" : "Already have an account?";
  const switchAction = mode === "login" ? () => { setMode("signup"); setOtpMode(false); setOtpSent(false); } : otpMode ? () => { setMode("login"); setOtpMode(false); setOtpSent(false); } : () => { setMode("login"); };

  if (submitted) {
    const isLogin = submitted === "login";
    return (
      <Reveal>
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-10 text-center">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-emerald-300">{isLogin ? "Signed in" : "Account created"}</p>
          <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-4xl">{isLogin ? "Welcome back." : "Welcome to the store."}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-ink-muted">Signed in as <strong className="text-ink">{email.trim()}</strong>.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/profile">Open profile</Button>
            <Button variant="secondary" href="/store">Browse the store</Button>
          </div>
        </div>
      </Reveal>
    );
  }

  const handleSendOtp = async () => {
    setShowErrors(true);
    if (!isValidEmail) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, purpose: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");
      setOtpSent(true);
      setOtpResendCooldown(60);
      setErrorMessage("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setShowErrors(true);
    if (otp.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, otp, purpose: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid OTP");
      // OTP verified, switch to registration form
      setMode("signup");
      setErrorMessage("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (otpResendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, purpose: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend OTP");
      setOtpResendCooldown(60);
      setErrorMessage("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setShowErrors(true);
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          first_name: firstName,
          last_name: lastName || undefined,
          phone: phone || undefined,
          rating: rating || undefined,
          otp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setSubmitted("signup");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setShowErrors(true);
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setSubmitted("login");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Reveal>
      <header className="mb-8 border-b border-line pb-8">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.28em] text-accent">{mode === "login" ? "Sign in" : otpMode ? "Verify email" : "Create account"}</p>
        <h1 className="text-3xl font-black tracking-[-0.06em] text-ink sm:text-5xl">{heading}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted">{subtitle}</p>
      </header>

      <form onSubmit={e => { e.preventDefault(); if (mode === "login") handleLogin(); else if (otpMode && !otpSent) handleSendOtp(); else if (mode === "otp") handleVerifyOtp(); else if (mode === "signup") handleSignup(); }} noValidate className="space-y-6">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-bold text-ink">Email address</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted"><MailIcon /></span>
            <input id="email" type="email" required placeholder="you@example.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setShowErrors(true)} aria-invalid={showErrors && !isValidEmail ? "true" : "false"} className={inputClass} />
          </div>
        </div>

        {mode === "login" && (
          <PasswordInput id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        )}

        {mode === "otp" && (
          <>
            <div>
              <label className="mb-2 block text-sm font-bold text-ink">Verification code</label>
              <OtpInput value={otp} onChange={setOtp} />
            </div>
            {otpSent && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-ink-muted">Code expires in 10 minutes.</p>
                <button type="button" disabled={otpResendCooldown > 0 || loading} onClick={resendOtp} className="text-xs font-black uppercase tracking-[0.18em] text-accent transition hover:text-accent-bright disabled:opacity-40">
                  {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : "Resend code"}
                </button>
              </div>
            )}
          </div>
        </div>
        </>}
        )}

        {mode === "signup" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="first_name" className="mb-2 block text-sm font-bold text-ink">First name <span className="text-red-400">*</span></label>
                <input id="first_name" type="text" required placeholder="John" autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass.replace("pl-12", "pl-5")} />
              </div>
              <div>
                <label htmlFor="last_name" className="mb-2 block text-sm font-bold text-ink">Last name</label>
                <input id="last_name" type="text" placeholder="Doe" autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass.replace("pl-12", "pl-5")} />
              </div>
            </div>
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-bold text-ink">Phone number (optional)</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted"><PhoneIcon /></span>
                <input id="phone" type="tel" placeholder="+1 555 123 4567" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-ink">Rate our website (optional)</label>
              <RatingStars value={rating} onChange={setRating} />
            </div>
            <div>
              <label htmlFor="confirm" className="mb-2 block text-sm font-bold text-ink">Confirm password <span className="text-red-400">*</span></label>
              <PasswordInput id="confirm" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" autoComplete="new-password" />
            </div>
            <div>
              <label htmlFor="otp" className="mb-2 block text-sm font-bold text-ink">Verification code <span className="text-red-400">*</span></label>
              <OtpInput value={otp} onChange={setOtp} />
            </div>
          </>
        )}

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200" role="alert">
            {errors.map(message => <li key={message}>· {message}</li>)}
          </ul>
        )}

        {errorMessage && (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200" role="alert">{errorMessage}</p>
        )}

        <Button type="submit" className="w-full justify-center shadow-[0_0_28px_rgba(0,162,255,0.4)]" disabled={loading || showErrors && !canSubmit}>
          {loading ? (
            <>
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              {cta}…
            </>
          ) : (
            cta
          )}
        </Button>

        <p className="text-sm text-ink-muted">
          {mode === "login" ? "Don&apos;t have an account?" : "Already have an account? "}<button type="button" onClick={() => { if (mode === "login") { setMode("signup"); setOtpMode(false); } else { setMode("login"); setOtpMode(false); setOtpSent(false); }} className="font-black text-accent transition hover:text-accent-bright">{mode === "login" ? "Create account →" : "← Back to sign in"}</button>
        </p>
      </form>

      <p className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-relaxed text-amber-100">
        <strong className="block text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Prototype note</strong>
        This is a UI prototype — no real authentication is wired up. In production the password would be hashed with bcrypt or argon2 on the server, never stored in plaintext.
      </p>
    </Reveal>
  );
}