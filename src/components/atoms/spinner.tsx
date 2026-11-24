import type * as React from "react";
import { cn } from "cn";

/** A spinning ring with a gap; size it with `size-*` classes. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      // own compositing layer: at fractional positions the ring is otherwise re-snapped to
      // the pixel grid every frame, which reads as shaking
      className={cn("size-4 animate-spin will-change-transform", className)}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export { Spinner };
