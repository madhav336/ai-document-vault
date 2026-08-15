import React from "react";

type IconButtonVariant = "default" | "danger";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // Required (not optional like the base HTML attribute) — icon-only buttons
  // must always describe their action for screen readers.
  "aria-label": string;
  variant?: IconButtonVariant;
}

const variantClasses: Record<IconButtonVariant, string> = {
  default: "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
  danger: "text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]",
};

export default function IconButton({
  variant = "default",
  className = "",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex cursor-pointer items-center justify-center rounded-full p-1.5 outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
