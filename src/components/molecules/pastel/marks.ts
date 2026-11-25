/** Hand-drawn marks from the design system (viewBox, path data). */
export const MARKS = {
  /** A curve that leaves to the left and rises to point up. */
  rise: {
    viewBox: "0 0 160 320",
    paths: ["M140 304 C 60 260, 22 170, 40 34", "M40 34 l13 31 M40 34 l-21 27"],
  },
  /** A loose loop, drawn around something (and by the loader). */
  circle: {
    viewBox: "0 0 320 160",
    paths: [
      "M170 18 C 60 14, 14 50, 22 86 C 32 132, 150 150, 240 136 C 300 126, 314 84, 292 54 C 268 22, 190 12, 120 26",
    ],
  },
} as const;
