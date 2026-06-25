import { createElement } from "react";
import type { ElementType, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  [key: string]: unknown;
}

export default function GlassCard({ children, className = "", as = "div", ...rest }: GlassCardProps) {
  return createElement(as, { className: `glass-card ${className}`, ...rest }, children);
}
