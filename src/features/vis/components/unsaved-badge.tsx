import { Hint } from "@/components/atoms/tooltip";
import { Badge } from "@/components/atoms/badge";
import { AlertCircle, Check } from "@/components/atoms/icons";
import type { SaveState } from "@/types/features/vis/components/unsaved-badge";
import { cn } from "@/utils";

interface UnsavedBadgeProps {
  state: SaveState;
  /** Where a click saves to. */
  dbName: string;
  onClick(): void;
}

/** A header-sized badge: taller than a table pill, and a button when it saves. */
const pill =
  "h-7 gap-1.5 px-2.5 text-xs font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

/** Header badge for the design's save state; clicking it reviews a save to the open database. */
export function UnsavedBadge({ state, dbName, onClick }: UnsavedBadgeProps) {
  if (state.kind === "saved") {
    return (
      <Badge variant="mint" role="status" className={pill}>
        <Check className="size-3.5" strokeWidth={3} aria-hidden /> Saved
      </Badge>
    );
  }
  if (state.kind === "blocked") {
    const label = `${state.problems} ${state.problems === 1 ? "problem" : "problems"}`;
    return (
      <Hint label="Fix these before saving">
        <Badge variant="rose" asChild className={cn(pill, "hover:bg-rose-wash/80")}>
          <button
            type="button"
            onClick={onClick}
            aria-label={`Unsaved changes with ${label}. Show what to fix`}
          >
            <AlertCircle className="size-3.5" aria-hidden /> Unsaved · {label}
          </button>
        </Badge>
      </Hint>
    );
  }
  return (
    <Hint label={`Click to review and save the changes to ${dbName}`}>
      <Badge variant="peach" asChild className={cn(pill, "hover:bg-peach-wash/80")}>
        <button type="button" onClick={onClick} aria-label={`Unsaved changes. Save to ${dbName}`}>
          <span aria-hidden className="size-1.5 rounded-full bg-peach-ink" /> Unsaved
        </button>
      </Badge>
    </Hint>
  );
}
