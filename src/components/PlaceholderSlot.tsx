import type { ReactNode } from "react";

type Props = {
  title: string;
  hint: string;
  children?: ReactNode;
  className?: string;
};

export function PlaceholderSlot({ title, hint, children, className }: Props) {
  return (
    <div className={`placeholder-slot ${className ?? ""}`.trim()}>
      <div className="placeholder-kicker">第一版預留</div>
      <div className="placeholder-title">{title}</div>
      <p className="placeholder-hint">{hint}</p>
      {children}
    </div>
  );
}
