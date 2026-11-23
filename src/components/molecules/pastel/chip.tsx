import type { ComponentProps } from "react";
import { cn } from "@/utils";
import { ACCENT_CLASSES, type Accent } from "./accent";

interface ChipProps extends ComponentProps<"span"> {
  variant?: "wash" | "solid" | "outline";
  accent?: Accent;
  size?: "sm" | "md";
}

/** Pill label for chapters, topics and states. Solid chips: one per view at most. */
export function Chip({
  variant = "wash",
  accent = "peach",
  size = "md",
  className,
  ...props
}: ChipProps) {
  const a = ACCENT_CLASSES[accent];
  return (
    <span
      className={cn(
        "pn-eyebrow inline-flex items-center gap-2 rounded-full whitespace-nowrap",
        size === "md" ? "h-8 px-3.5" : "h-6 px-2.5 text-[0.6875rem] tracking-widest",
        variant === "wash" && [a.wash, a.ink],
        variant === "solid" && [a.solid, "text-on-accent"],
        variant === "outline" && "text-ink-soft ring-2 ring-hairline ring-inset",
        className,
      )}
      {...props}
    />
  );
}
