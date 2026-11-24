import type { Row } from "@/types/lib/sqlite/types";

export interface ExportSource {
  label: string;
  load(): Promise<{ columns: string[]; rows: Row[] }>;
}
