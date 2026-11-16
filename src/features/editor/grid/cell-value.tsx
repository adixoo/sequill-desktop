import { Braces, Image as ImageIcon } from "@/shared/ui/icons";
import { memo } from "react";
import { blobImageType, cellPreview, valueKind } from "@/shared/lib/data/format";
import type { CellValue } from "@/shared/lib/sqlite/types";
import { cn } from "@/shared/lib/utils";

/** How one value looks in a grid cell. Kind is shown by style and glyphs, never colour alone. */
export const CellValueView = memo(function CellValueView({ value }: { value: CellValue }) {
  const kind = valueKind(value);
  switch (kind) {
    case "null":
      return (
        <span className="font-mono text-[0.6875rem] tracking-[0.04em] text-ink-muted italic">
          NULL
        </span>
      );
    case "integer":
    case "real":
      return <span className="pn-tnum block w-full text-right text-ink">{cellPreview(value)}</span>;
    case "blob": {
      const isImage = blobImageType(value as Uint8Array) !== null;
      const Icon = isImage ? ImageIcon : null;
      return (
        <span className="inline-flex items-center gap-1 rounded-xs bg-raised px-1.5 font-mono text-[0.6875rem] text-ink-soft">
          {Icon && <Icon className="size-3" aria-hidden />}
          {cellPreview(value)}
        </span>
      );
    }
    case "json":
      return (
        <span className="inline-flex min-w-0 items-center gap-1 text-ink-soft">
          <Braces className="size-3 shrink-0 text-lilac-ink" aria-label="JSON" />
          <span className="truncate font-mono text-xs">{cellPreview(value)}</span>
        </span>
      );
    default:
      return (
        <span className={cn("truncate text-ink-soft", value === "" && "text-ink-muted")}>
          {cellPreview(value) || " "}
        </span>
      );
  }
});
