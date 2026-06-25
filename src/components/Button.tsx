import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { AnchorHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  icon?: ReactNode;
  className?: string;
}

type AnchorButtonProps = ButtonBaseProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

type NativeButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: never;
};

export type ButtonProps = AnchorButtonProps | NativeButtonProps;

const variants: Record<ButtonVariant, string> = {
  primary: "gumroad-button",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface/60 px-5 py-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:bg-surface-bright hover:text-ink hover:shadow-[0_0_22px_rgba(0,162,255,0.18)] focus-visible:outline-none",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-slate-800/40 hover:text-ink focus-visible:outline-none"
};

export default function Button({
  children,
  variant = "primary",
  icon,
  className = "",
  ...props
}: ButtonProps) {
  const base = variants[variant];

  if ("href" in props && props.href) {
    const { href, ...rest } = props;
    return (
      <a className={`${base} ${className}`} href={href} {...rest}>
        {children}
        {icon}
      </a>
    );
  }

  return (
    <button className={`${base} ${className}`} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
      {icon}
    </button>
  );
}
