import { Download } from "@/shared/ui/icons";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import {
  downloadBlob,
  EXPORT_FORMATS,
  safeFileName,
  serialize,
  type ExportFormat,
} from "@/shared/lib/data/export";
import { formatCount } from "@/shared/lib/data/format";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import type { Row } from "@/shared/lib/sqlite/types";

export interface ExportSource {
  label: string;
  load(): Promise<{ columns: string[]; rows: Row[] }>;
}

interface ExportMenuProps {
  /** Used for the file name and as the table name in SQL INSERTs. */
  name: string;
  sources: ExportSource[];
  disabled?: boolean;
}

export async function exportRows(
  source: ExportSource,
  format: ExportFormat,
  name: string,
): Promise<void> {
  const id = toast.loading(`Preparing ${EXPORT_FORMATS[format].label}…`);
  try {
    const { columns, rows } = await source.load();
    const meta = EXPORT_FORMATS[format];
    downloadBlob(
      serialize(format, name, columns, rows),
      `${safeFileName(name)}.${meta.extension}`,
      meta.mime,
    );
    toast.success(`Exported ${formatCount(rows.length)} rows as ${meta.label}`, { id });
  } catch (error) {
    toast.error(errorMessage(error), { id });
  }
}

export function ExportMenu({ name, sources, disabled }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label="Export">
          <Download />
          <span>Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sources.map((source, i) => (
          <div key={source.label}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="pn-eyebrow text-ink-muted">
              {source.label}
            </DropdownMenuLabel>
            {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
              <DropdownMenuItem key={format} onSelect={() => void exportRows(source, format, name)}>
                {EXPORT_FORMATS[format].label}
                <span className="ml-auto font-mono text-[0.6875rem] text-ink-muted">
                  .{EXPORT_FORMATS[format].extension}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
