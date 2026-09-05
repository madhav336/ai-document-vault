import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] border-transparent hover:bg-[var(--accent-2)]",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-hover)]",
  danger:
    "bg-[var(--danger-bg)] text-[var(--danger)] border-transparent hover:opacity-80",
};

export default function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-3.5 py-2 text-[13px] font-semibold outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        fullWidth ? "w-full" : ""
      } ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
