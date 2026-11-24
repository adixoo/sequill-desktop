import { Columns3 } from "@/components/atoms/icons";
import { Button } from "@/components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import type { ColumnLayout } from "@/types/store/workspace";

interface ColumnsMenuProps {
  columns: string[];
  layout: ColumnLayout;
  onChange(patch: Partial<ColumnLayout>): void;
}

export function ColumnsMenu({ columns, layout, onChange }: ColumnsMenuProps) {
  const hidden = new Set(layout.hidden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={layout.hidden.length > 0 ? "secondary" : "ghost"} aria-label="Columns">
          <Columns3 />
          <span>Columns</span>
          {layout.hidden.length > 0 && (
            <span className="q-num font-mono text-[0.6875rem] text-ink-muted">
              {columns.length - layout.hidden.length}/{columns.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56">
        <DropdownMenuLabel className="q-label text-ink-muted">Visible columns</DropdownMenuLabel>
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c}
            checked={!hidden.has(c)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              onChange({
                hidden: checked ? layout.hidden.filter((h) => h !== c) : [...layout.hidden, c],
              })
            }
          >
            <span className="truncate">{c}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onChange({ hidden: [], order: [], widths: {}, pinned: [] })}
        >
          Reset layout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
