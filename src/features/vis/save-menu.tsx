import { ChevronDown, DatabaseZap, Download, FilePlus, Undo } from "@/shared/ui/icons";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { changeSummary, type Draft } from "@/features/vis/lib/model";

interface SaveMenuProps {
  draft: Draft;
  statements: string[];
  problems: string[];
  /** Name of the open database; null for a blank design. */
  dbName: string | null;
  onUpdate(): void;
  onSaveAsNew(): void;
  onDownload(): void;
  onDiscard(): void;
}

/**
 * The other save choices, beside the header's "Unsaved" badge (a click on the
 * badge saves to the open database). Nothing reaches a database until saved.
 */
export function SaveMenu({
  draft,
  statements,
  problems,
  dbName,
  onUpdate,
  onSaveAsNew,
  onDownload,
  onDiscard,
}: SaveMenuProps) {
  const blocked = problems.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Save options" title="Save options">
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
          <span className="text-sm font-medium text-ink">Unsaved changes</span>
          <span className="text-xs font-normal text-ink-muted">
            {changeSummary(draft).join(" · ")}
          </span>
        </DropdownMenuLabel>
        {blocked && (
          <ul
            aria-label="Problems"
            className="mx-1.5 mb-1.5 flex flex-col gap-1 rounded-sm bg-rose-wash px-2.5 py-2 text-xs text-rose-ink"
          >
            {problems.map((p) => (
              <li key={p}>− {p}</li>
            ))}
          </ul>
        )}
        <DropdownMenuSeparator />
        {dbName && (
          <DropdownMenuItem disabled={blocked} onSelect={onUpdate} className="items-start py-2">
            <DatabaseZap className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Review and save to {dbName}</span>
              <span className="text-xs text-ink-muted">See the SQL before it runs</span>
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={blocked} onSelect={onSaveAsNew} className="items-start py-2">
          <FilePlus className="mt-0.5" />
          <span className="flex flex-col">
            <span className="font-medium">
              {dbName ? "Save as a new database" : "Save as database"}
            </span>
            <span className="text-xs text-ink-muted">
              {dbName
                ? "Copy the schema with your changes; this one stays as it is"
                : "Create a database from this design"}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={blocked} onSelect={onDownload}>
          <Download /> Download SQL
          <span className="ml-auto text-xs text-ink-muted">
            {statements.length} {statements.length === 1 ? "statement" : "statements"}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDiscard}>
          <Undo /> Discard changes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
