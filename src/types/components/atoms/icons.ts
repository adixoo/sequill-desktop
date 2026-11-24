import type { HugeiconsIconProps } from "@hugeicons/react";

/** Props every app icon accepts: any SVG attribute plus Hugeicons' size and stroke options. */
export type IconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "showAlt">;
