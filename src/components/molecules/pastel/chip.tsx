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
        "q-label inline-flex items-center gap-2 rounded-full whitespace-nowrap",
        size === "md" ? "h-(--control-sm) px-3" : "h-(--pill-h) px-2",
        variant === "wash" && [a.wash, a.ink],
        variant === "solid" && [a.solid, "text-on-accent"],
        variant === "outline" && "text-ink-soft ring-2 ring-hairline ring-inset",
        className,
      )}
      {...props}
    />
  );
}
