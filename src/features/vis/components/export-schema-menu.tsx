import { toast } from "@/components/atoms/toast";
import { Button } from "@/components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import { FileDown } from "@/components/atoms/icons";
import { DialectIcon } from "@/components/molecules/dialect-icon";
import { exportSchema } from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";
import { downloadBlob, safeFileName } from "@/utils/data/export";
import { IMPORT_DIALECTS } from "@/features/vis/lib/dialects";
import type { Dialect } from "@/types/features/vis/lib/dialects";

interface ExportSchemaMenuProps {
  /** The whole design as SQLite statements (the schema with unsaved changes); may throw
   * while the design has problems. Built only when exporting. */
  statements(): string[];
  /** Names the downloaded file. */
  name: string;
}

/** Downloads the design's schema as CREATE statements for another database. */
export function ExportSchemaMenu({ statements, name }: ExportSchemaMenuProps) {
  const download = async (target: Dialect) => {
    try {
      const sql = await exportSchema(statements(), target.value);
      downloadBlob(sql, `${safeFileName(name)}-${target.value}.sql`, "application/sql");
    } catch (error) {
      toast.error(`The schema couldn't be exported: ${errorMessage(error)}`);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" title="Export the schema for another database">
          <FileDown /> <span className="max-sm:sr-only">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-ink-muted">
          Schema as SQL for
        </DropdownMenuLabel>
        {IMPORT_DIALECTS.map((target) => (
          <DropdownMenuItem key={target.value} onSelect={() => void download(target)}>
            <DialectIcon dialect={target.value} className="size-(--icon)" />
            {target.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
