export type SaveState =
  { kind: "unsaved" } | { kind: "blocked"; problems: number } | { kind: "saved" };
