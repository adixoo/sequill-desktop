/**
 * Seeded randomness for stress tests: the same seed gives the same inputs, so a failure can
 * be replayed. Set STRESS_SEED to try other inputs; the seed is in each test's name.
 */
export const SEED = Number(process.env.STRESS_SEED ?? 20261124);

export interface Random {
  /** A float in [0, 1). */
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** Text mixing letters, digits, spaces, quotes, tabs, newlines, % _ \ and non-ASCII. */
  text(maxLength: number): string;
  bytes(maxLength: number): Uint8Array;
}

const ALPHABET = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  " ",
  " ",
  '"',
  "'",
  "\t",
  "\n",
  "\r\n",
  ",",
  ";",
  "%",
  "_",
  "\\",
  "é",
  "ß",
  "日本",
  "🙂",
  " ",
];

/** mulberry32: small, fast and good enough for test data. */
export function random(seed = SEED): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    chance: (p) => next() < p,
    text: (maxLength) =>
      Array.from({ length: int(0, maxLength) }, () => ALPHABET[int(0, ALPHABET.length - 1)]).join(
        "",
      ),
    bytes: (maxLength) => Uint8Array.from({ length: int(0, maxLength) }, () => int(0, 255)),
  };
}
