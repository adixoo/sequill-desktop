/** Hand-drawn marks from the design system (viewBox, path data). */
export const MARKS = {
  curve: {
    viewBox: "0 0 320 160",
    paths: ["M16 140 C 60 60, 150 22, 286 40", "M286 40 l-31 13 M286 40 l-27 -21"],
  },
  /** `curve` turned a quarter turn: it leaves to the left and rises to point up. */
  rise: {
    viewBox: "0 0 160 320",
    paths: ["M140 304 C 60 260, 22 170, 40 34", "M40 34 l13 31 M40 34 l-21 27"],
  },
  straight: {
    viewBox: "0 0 300 80",
    paths: ["M12 46 C 90 38, 180 44, 280 36", "M280 36 l-25 17 M280 36 l-27 -13"],
  },
  down: {
    viewBox: "0 0 160 260",
    paths: ["M60 14 C 20 80, 130 120, 96 236", "M96 236 l-8 -31 M96 236 l23 -22"],
  },
  loop: {
    viewBox: "0 0 360 200",
    paths: [
      "M20 170 C 90 170, 120 120, 110 90 C 100 55, 60 60, 70 95 C 82 135, 180 150, 330 60",
      "M330 60 l-17 30 M330 60 l-34 1",
    ],
  },
  underline: {
    viewBox: "0 0 400 60",
    paths: ["M10 28 C 120 16, 260 20, 390 24", "M44 46 C 150 36, 270 38, 358 40"],
  },
  circle: {
    viewBox: "0 0 320 160",
    paths: [
      "M170 18 C 60 14, 14 50, 22 86 C 32 132, 150 150, 240 136 C 300 126, 314 84, 292 54 C 268 22, 190 12, 120 26",
    ],
  },
} as const;

export type MarkName = keyof typeof MARKS;
