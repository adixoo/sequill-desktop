import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/utils";

/**
 * CSS-only enter animation for above-the-fold content: it paints immediately
 * (no JavaScript needed) and rises in at `stagger-row` intervals.
 */
export function Rise({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <div className={cn("pn-rise", className)} style={{ "--i": index } as CSSProperties}>
      {children}
    </div>
  );
}
