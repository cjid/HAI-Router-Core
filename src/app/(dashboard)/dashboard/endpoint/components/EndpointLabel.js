"use client";

/** Left column label — stretches to match row height (input / button). */
export default function EndpointLabel({ children, active = false, className = "" }) {
  return (
    <span
      className={`text-xs font-mono px-2 rounded-[10px] shrink-0 min-w-[88px] self-stretch inline-flex items-center justify-center ${
        active ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted"
      } ${className}`}
    >
      {children}
    </span>
  );
}
