/** Static class maps per accent so Tailwind sees every class name. */
export type Accent = "peach" | "butter" | "mint" | "sky" | "lilac" | "rose";

export const ACCENT_CLASSES: Record<
  Accent,
  { wash: string; ink: string; solid: string; border: string }
> = {
  peach: {
    wash: "bg-peach-wash",
    ink: "text-peach-ink",
    solid: "bg-peach",
    border: "border-peach-ink",
  },
  butter: {
    wash: "bg-butter-wash",
    ink: "text-butter-ink",
    solid: "bg-butter",
    border: "border-butter-ink",
  },
  mint: { wash: "bg-mint-wash", ink: "text-mint-ink", solid: "bg-mint", border: "border-mint-ink" },
  sky: { wash: "bg-sky-wash", ink: "text-sky-ink", solid: "bg-sky", border: "border-sky-ink" },
  lilac: {
    wash: "bg-lilac-wash",
    ink: "text-lilac-ink",
    solid: "bg-lilac",
    border: "border-lilac-ink",
  },
  rose: { wash: "bg-rose-wash", ink: "text-rose-ink", solid: "bg-rose", border: "border-rose-ink" },
};

/** StepFlow badges always run in this order. */
export const STEP_ACCENTS: Accent[] = ["sky", "butter", "mint", "lilac"];
