import { m } from "motion/react";
import type { ReactNode } from "react";
import { dur, ease } from "@/shared/lib/motion";
import { cn } from "@/shared/lib/utils";
import { ACCENT_CLASSES, type Accent } from "./accent";

const WASH_VAR: Record<Accent, string> = {
  peach: "var(--peach-wash)",
  butter: "var(--butter-wash)",
  mint: "var(--mint-wash)",
  sky: "var(--sky-wash)",
  lilac: "var(--lilac-wash)",
  rose: "var(--rose-wash)",
};

/**
 * Marker wash swiped in behind a phrase; the phrase takes the accent.
 * box-decoration-break gives each wrapped line its own swipe.
 */
export function Highlight({
  children,
  accent = "mint",
  delay = 0.3,
}: {
  children: ReactNode;
  accent?: Accent;
  delay?: number;
}) {
  return (
    <m.span
      className={cn(
        "rounded-xs [box-decoration-break:clone] bg-no-repeat px-[0.12em] [-webkit-box-decoration-break:clone]",
        ACCENT_CLASSES[accent].ink,
      )}
      style={{ backgroundImage: `linear-gradient(${WASH_VAR[accent]}, ${WASH_VAR[accent]})` }}
      initial={{ backgroundSize: "0% 100%" }}
      whileInView={{ backgroundSize: "100% 100%" }}
      viewport={{ once: true }}
      transition={{ duration: dur.slow, ease: ease.move, delay }}
    >
      {children}
    </m.span>
  );
}
