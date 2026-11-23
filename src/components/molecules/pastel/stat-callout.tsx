import type { ReactNode } from "react";
import { cn } from "@/utils";
import { ACCENT_CLASSES, type Accent } from "./accent";

interface StatCalloutProps {
  kicker: string;
  value: ReactNode;
  unit?: string;
  label: string;
  /** Context line; prefix with ▲ / ▼ when it is a delta. */
  detail?: string;
  accent?: Accent;
  className?: string;
}

/** One big number per panel. */
export function StatCallout({
  kicker,
  value,
  unit,
  label,
  detail,
  accent = "mint",
  className,
}: StatCalloutProps) {
  return (
    <div
      className={cn("rounded-md bg-surface p-6 ring-2 ring-hairline ring-inset md:p-8", className)}
    >
      <p className="pn-eyebrow text-ink-muted">{kicker}</p>
      <p
        className={cn(
          "pn-tnum mt-4 text-6xl leading-[0.9] font-bold tracking-[-0.04em] md:text-7xl",
          ACCENT_CLASSES[accent].ink,
        )}
      >
        {value}
        {unit && (
          <span className="ml-2 text-2xl font-semibold tracking-normal md:text-3xl">{unit}</span>
        )}
      </p>
      <p className="mt-4 text-lg font-medium text-ink">{label}</p>
      {detail && <p className="mt-1 text-sm text-ink-muted">{detail}</p>}
    </div>
  );
}
