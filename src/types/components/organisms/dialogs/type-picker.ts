import type { DataType } from "@/types/constants/data-types";

/** The types a column can take: a database's own types, and the enums its schema defines. */
export interface TypeChoices {
  /** The database's name, for the group heading ("PostgreSQL"). */
  label: string;
  types: readonly DataType[];
  enums: readonly string[];
}
