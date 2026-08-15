import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
}

export default function Card({ raised = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-[14px] border border-[var(--border)] bg-[var(--surface)] ${
        raised ? "shadow-[var(--shadow-lg)]" : "shadow-[var(--shadow-sm)]"
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
