import { AlertCircle, Check } from "@/components/atoms/icons";
import { cn } from "@/utils";

export type SaveState =
  { kind: "unsaved" } | { kind: "blocked"; problems: number } | { kind: "saved" };

interface UnsavedBadgeProps {
  state: SaveState;
  /** Where a click saves to; null for a blank design (it becomes a new database). */
  dbName: string | null;
  onClick(): void;
}

const pill =
  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring";

/** Header badge for the design's save state; clicking it reviews a save to the open database. */
export function UnsavedBadge({ state, dbName, onClick }: UnsavedBadgeProps) {
  if (state.kind === "saved") {
    return (
      <span role="status" className={cn(pill, "bg-mint-wash text-mint-ink")}>
        <Check className="size-3.5" strokeWidth={3} aria-hidden /> Saved
      </span>
    );
  }
  if (state.kind === "blocked") {
    const label = `${state.problems} ${state.problems === 1 ? "problem" : "problems"}`;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Unsaved changes with ${label}. Show what to fix`}
        title="Fix these before saving"
        className={cn(pill, "bg-rose-wash text-rose-ink hover:bg-rose-wash/80")}
      >
        <AlertCircle className="size-3.5" aria-hidden /> Unsaved · {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        dbName ? `Unsaved changes. Save to ${dbName}` : "Unsaved design. Save as a database"
      }
      title={
        dbName
          ? `Click to review and save the changes to ${dbName}`
          : "Click to save this design as a database"
      }
      className={cn(pill, "bg-peach-wash text-peach-ink hover:bg-peach-wash/80")}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-peach-ink" /> Unsaved
    </button>
  );
}
