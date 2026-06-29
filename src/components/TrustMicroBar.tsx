interface TrustMicroBarProps {
  variant?: "compact" | "full";
}

function InstantIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h7v8l11-13h-8z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 16.93-3L21 8M21 3v5h-5M21 12a9 9 0 0 1-16.93 3L3 16M3 21v-5h5" />
    </svg>
  );
}

export default function TrustMicroBar({ variant = "compact" }: TrustMicroBarProps) {
  const baseClass =
    "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em]";

  if (variant === "compact") {
    return (
      <div className={`${baseClass} text-ink-muted`}>
        <span className="inline-flex items-center gap-1">
          <InstantIcon />
          Instant
        </span>
        <span aria-hidden="true" className="opacity-30">·</span>
        <span className="inline-flex items-center gap-1">
          <RefreshIcon />
          Updates
        </span>
        <span aria-hidden="true" className="opacity-30">·</span>
        <span className="inline-flex items-center gap-1">
          <ShieldIcon />
          30-day
        </span>
      </div>
    );
  }

  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-ink-muted">
      <li className={baseClass}>
        <ShieldIcon />
        Secure checkout
      </li>
      <li className={baseClass}>
        <InstantIcon />
        Instant download
      </li>
      <li className={baseClass}>
        <RefreshIcon />
        Lifetime updates
      </li>
      <li className={baseClass}>
        <ShieldIcon />
        30-day refund
      </li>
    </ul>
  );
}
