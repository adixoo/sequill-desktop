import {
  ChevronsUpDown,
  Database,
  Download,
  FileCode,
  FileUp,
  FolderOpen,
  PencilRuler,
  Pencil,
  Plus,
  Sparkles,
  Trash,
} from "@/components/atoms/icons";
import { useRef } from "react";
import { Button } from "@/components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import { useDbActions } from "@/hooks/use-db-actions";
import { useDatabases } from "@/hooks/use-db";
import { DbFileInput } from "@/components/molecules/db-file-input";
import { formatBytes } from "@/utils/data/format";
import { isDesktop } from "@/lib/platform";
import { useDialogs } from "@/store/dialogs";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/utils";
import { BLANK_DESIGN, hasUnsavedDesign } from "@/features/vis/lib/drafts";

interface DatabaseSwitcherProps {
  /** The database shown as current; null when none (or a blank design) is open. */
  dbId: string | null;
  /** Lets a page step in before switching (e.g. to ask about unsaved work). Defaults to switching. */
  onSwitch?(dbId: string): void;
  /** The schema page also offers a design that isn't tied to any database. */
  blankDesign?: { active: boolean; onSelect(): void };
  /** The schema page can also make a database from another database's schema. */
  onImportSchema?(): void;
  /** "panel" fills a sidebar; "inline" is a single-line header control. */
  variant?: "panel" | "inline";
  className?: string;
}

/**
 * The databases saved here (browser or computer) and what you can do with them. The same
 * list and actions appear in the editor and on the schema page.
 */
export function DatabaseSwitcher({
  dbId,
  onSwitch,
  blankDesign,
  onImportSchema,
  variant = "panel",
  className,
}: DatabaseSwitcherProps) {
  const dbs = useDatabases();
  const setDb = useWorkspace((s) => s.setDb);
  const openDialog = useDialogs((s) => s.open);
  const actions = useDbActions();
  const fileInput = useRef<HTMLInputElement>(null);
  const current = blankDesign?.active ? undefined : dbs.data?.find((d) => d.id === dbId);
  const switchTo = onSwitch ?? setDb;
  const label = blankDesign?.active ? "Blank design" : (current?.name ?? "No database");

  return (
    <DropdownMenu>
      <DbFileInput ref={fileInput} />
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Database: ${label}`}
          className={cn(
            "justify-between gap-2 text-left",
            variant === "panel" ? "h-auto w-full py-1.5" : "h-8 w-56 max-sm:w-40",
            className,
          )}
        >
          {variant === "panel" ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-ink">{label}</span>
              <span className="font-mono text-[0.6875rem] text-ink-muted">
                {current ? formatBytes(current.sizeBytes) : `${dbs.data?.length ?? 0} saved`}
              </span>
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              {blankDesign?.active ? (
                <PencilRuler className="text-ink-muted" aria-hidden />
              ) : (
                <Database className="text-ink-muted" aria-hidden />
              )}
              <span className="truncate text-sm font-semibold text-ink">{label}</span>
              {current && (
                <span className="font-mono text-[0.6875rem] text-ink-muted max-sm:hidden">
                  {formatBytes(current.sizeBytes)}
                </span>
              )}
            </span>
          )}
          <ChevronsUpDown className="text-ink-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64"
      >
        <DropdownMenuLabel className="pn-eyebrow text-ink-muted">
          {isDesktop() ? "On this computer" : "In this browser"}
        </DropdownMenuLabel>
        {dbs.data?.map((d) => (
          <DropdownMenuItem
            key={d.id}
            onSelect={() => switchTo(d.id)}
            title={d.path ?? undefined}
            className={cn(d.id === current?.id && "bg-sky-wash")}
          >
            <Database />
            <span className="truncate">{d.name}</span>
            {hasUnsavedDesign(d.id) && (
              <span
                className="pn-table-head shrink-0 text-peach-ink"
                title="Has an unsaved schema design"
              >
                draft
              </span>
            )}
            <span className="ml-auto font-mono text-[0.6875rem] text-ink-muted">
              {formatBytes(d.sizeBytes)}
            </span>
          </DropdownMenuItem>
        ))}
        {dbs.data?.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-ink-muted">Nothing saved yet</p>
        )}
        {blankDesign && (
          <DropdownMenuItem
            onSelect={blankDesign.onSelect}
            className={cn(blankDesign.active && "bg-sky-wash")}
          >
            <PencilRuler /> Blank design
            {hasUnsavedDesign(BLANK_DESIGN) && (
              <span className="pn-table-head ml-auto text-peach-ink">draft</span>
            )}
          </DropdownMenuItem>
        )}
        {onImportSchema && (
          <DropdownMenuItem onSelect={onImportSchema}>
            <FileUp /> Import a schema…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openDialog({ kind: "newDatabase" })}>
          <Plus /> New empty database
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.pickFile(fileInput.current)}>
          <FolderOpen /> Open a file…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void actions.createSample()}>
          <Sparkles /> Create sample database
        </DropdownMenuItem>
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="pn-eyebrow text-ink-muted">
              {current.name}
            </DropdownMenuLabel>
            {current.path && (
              <p
                className="truncate px-2 pb-1.5 font-mono text-[0.6875rem] text-ink-muted"
                title={current.path}
              >
                Changes save to {current.path}
              </p>
            )}
            <DropdownMenuItem onSelect={() => void actions.download(current)}>
              <Download /> Download .sqlite
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void actions.downloadDump(current)}>
              <FileCode /> Download SQL dump
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                openDialog({ kind: "renameDatabase", dbId: current.id, name: current.name })
              }
            >
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => openDialog({ kind: "deleteDatabase", db: current })}
            >
              <Trash />{" "}
              {current.path ? "Remove from list" : isDesktop() ? "Delete" : "Delete from browser"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
