export interface Dialect {
  value: string;
  label: string;
  /** How to get the schema out of this database with `command`, in one sentence. */
  howTo: string;
  /** A terminal command that prints it, when there is one. */
  command?: string;
  /** A query that prints it from any SQL editor (no terminal needed), when there is one. */
  query?: string;
  /** Kinds of objects (beside tables) this database has, in the order the outline lists them. */
  objectKinds: readonly ObjectKind[];
}

export type ObjectKind =
  "enum" | "type" | "sequence" | "function" | "procedure" | "view" | "trigger";
