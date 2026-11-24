import type { TypeKind } from "@/types/utils/data/format";

/** A column type a database offers, as the type picker lists it. */
export interface DataType {
  /** The spelling the picker writes into the column. */
  name: string;
  kind: TypeKind;
  /** What it holds, in a few words. */
  description: string;
  /** Other spellings of the same type, as schemas and dumps write them. */
  aliases?: readonly string[];
}
