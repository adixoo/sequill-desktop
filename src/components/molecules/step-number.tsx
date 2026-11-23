import { cn } from "@/utils";

/** A number in a circle, for steps. */
export function StepNumber({ n, size = "sm" }: { n: number; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-sky-wash font-mono font-medium text-sky-ink",
        size === "md" ? "size-6 text-xs" : "mt-0.5 size-5 text-[0.6875rem]",
      )}
    >
      {n}
    </span>
  );
}
