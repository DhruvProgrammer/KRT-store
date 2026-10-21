import type { CSSProperties, ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Scroll reveal — CSS only.
 *
 * The entrance animation is driven by the CSS `view()` scroll timeline (see
 * `src/styles/global.css`), so it needs no JavaScript and no animation
 * library: the markup ships visible and the browser fades the element in as
 * it enters the viewport.
 *
 * `delay` shifts the start of the animation range via the `--reveal-delay`
 * custom property (0.06 -> "6%"), keeping the staggered look of the old
 * framer-motion implementation.
 */
export default function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const style =
    delay > 0 ? ({ "--reveal-delay": `${delay * 100}%` } as CSSProperties) : undefined;

  return (
    <div
      className={className ? `reveal ${className}` : "reveal"}
      data-reveal=""
      style={style}
    >
      {children}
    </div>
  );
}
