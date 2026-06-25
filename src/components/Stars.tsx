interface StarsProps {
  value: number;
  count?: number;
  size?: "sm" | "md";
}

export default function Stars({ value, count, size = "sm" }: StarsProps) {
  const rounded = Math.round(value * 2) / 2;
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = rounded >= i + 1;
          const half = !filled && rounded >= i + 0.5;
          return (
            <svg
              key={i}
              viewBox="0 0 24 24"
              className={`${sizeClass} ${filled ? "fill-amber-400" : half ? "fill-amber-400/50" : "fill-slate-600/60"}`}
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          );
        })}
      </div>
      <span className={`${textSize} font-bold text-ink-muted`}>
        {value.toFixed(1)}
        {typeof count === "number" && (
          <>
            <span className="mx-1 opacity-30">·</span>
            {count.toLocaleString()} {count === 1 ? "review" : "reviews"}
          </>
        )}
      </span>
      <span className="sr-only">Rated {value.toFixed(1)} out of 5</span>
    </div>
  );
}
