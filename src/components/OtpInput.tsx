interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
}

export default function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  return (
    <div className="flex gap-2 sm:gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          id={`otp-${i}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => {
            const next = value.slice(0, i) + e.target.value + value.slice(i + 1);
            onChange(next);
            if (e.target.value && i < length - 1) {
              (document.getElementById(`otp-${i + 1}`) as HTMLInputElement)?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !e.currentTarget.value && i > 0) {
              (document.getElementById(`otp-${i - 1}`) as HTMLInputElement)?.focus();
            }
          }}
          className="h-12 w-12 sm:w-14 rounded-xl border border-line bg-surface/60 text-center text-2xl font-black text-ink outline-none transition focus:border-accent focus:bg-surface-bright focus:ring-1 focus:ring-accent"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}
