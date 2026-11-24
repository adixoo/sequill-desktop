/**
 * Pastel Noir motion tokens for the `motion` library (seconds and bezier arrays).
 * Mirrors the --dur-* and --ease-* tokens in src/styles/globals.css.
 */
import type { Transition } from "motion/react";

export const ease = {
  enter: [0.16, 1, 0.3, 1],
  move: [0.65, 0, 0.35, 1],
  exit: [0.7, 0, 0.84, 0],
  pop: [0.34, 1.56, 0.64, 1],
  draw: [0.45, 0, 0.2, 1],
} as const;

export const dur = {
  instant: 0.1,
  quick: 0.2,
  base: 0.4,
  slow: 0.7,
  draw: 0.6,
  write: 0.8,
  scene: 1.2,
  hold: 2.5,
  staggerRow: 0.07,
} as const;

/** Things arriving: rise 24px (scaled down for UI) and fade. */
export const enter = (delay = 0, distance = 16) =>
  ({
    initial: { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: { duration: dur.base, ease: ease.enter, delay } satisfies Transition,
  }) as const;

/** Small UI state changes stay around 150ms. */
export const quick: Transition = { duration: 0.15, ease: ease.enter };
