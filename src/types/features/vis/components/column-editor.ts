import type { Draft } from "@/types/features/vis/lib/model";
import type { Schema } from "@/types/lib/sqlite/types";
import type { TypeChoices } from "@/types/components/organisms/dialogs/type-picker";

/** What the outline and the table cards need to edit the schema. Edits stay in the draft until saved. */
export interface SchemaEditor {
  draft: Draft;
  schema: Schema | undefined;
  /** Tables a column can reference, with their columns. */
  refTables: { name: string; columns: string[] }[];
  /** For a schema imported from another database: its types and enums to choose from. */
  types?: TypeChoices;
  onChange(draft: Draft): void;
}
