import { Check } from "@/components/atoms/icons";
import { Spinner } from "@/components/atoms/spinner";
import { cn } from "@/utils";

export interface LoaderStage {
  label: string;
  state: "done" | "active" | "pending";
}

interface LoaderProps {
  /** Mono status line under the mark. */
  label?: string;
  stages?: LoaderStage[];
  className?: string;
  size?: "sm" | "lg";
}

/** A spinner with a status line, and optional stages, for loading states. */
export function Loader({ label = "Loading", stages, className, size = "lg" }: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center gap-5 text-center", className)}
    >
      <Spinner aria-hidden="true" className={size === "lg" ? "size-8" : "size-6"} />
      <p className="font-mono text-xs font-medium tracking-[0.04em] text-ink-soft">{label}…</p>
      {stages && stages.length > 0 && (
        <ol className="flex flex-col gap-2 text-left text-sm">
          {stages.map((s) => (
            <li
              key={s.label}
              className={cn(
                "flex items-center gap-2.5",
                s.state === "done" && "text-ink-soft",
                s.state === "active" && "font-medium text-ink",
                s.state === "pending" && "text-ink-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 items-center justify-center rounded-full",
                  s.state === "done" && "bg-mint text-on-accent",
                  s.state === "active" && "ring-2 ring-sky-ink ring-inset",
                  s.state === "pending" && "ring-2 ring-hairline ring-inset",
                )}
              >
                {s.state === "done" && <Check className="size-3" strokeWidth={3} />}
                {s.state === "active" && (
                  <span className="size-1.5 animate-pulse rounded-full bg-sky-ink" />
                )}
              </span>
              {s.label}
              <span className="sr-only">
                {s.state === "done"
                  ? "(done)"
                  : s.state === "active"
                    ? "(in progress)"
                    : "(waiting)"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
