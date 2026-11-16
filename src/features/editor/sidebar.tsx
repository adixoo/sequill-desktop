import {
  Bookmark,
  ChevronDown,
  Eye,
  FileCode,
  ListTree,
  MoreHorizontal,
  Pencil,
  Plus,
  SquareTerminal,
  Table,
  TableProperties,
  Trash,
  Upload,
  Network,
  Zap,
} from "@/shared/ui/icons";
import { useState, type ReactNode } from "react";
import { DatabaseSwitcher } from "@/shared/components/database-switcher";
import { Link } from "@/shared/components/link";
import { ROUTES } from "@/shared/lib/router";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { useTableCount } from "@/shared/hooks/use-db";
import { useSavedQueryActions } from "@/shared/hooks/use-saved-queries";
import { formatCount } from "@/shared/lib/data/format";
import type { SavedQuery } from "@/shared/lib/data/saved-queries";
import type { RelationInfo, Schema, SchemaObject } from "@/shared/lib/sqlite/types";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { useSavedQueries } from "@/shared/lib/store/saved-queries";
import { useWorkspace } from "@/shared/lib/store/workspace";
import { cn } from "@/shared/lib/utils";

function Group({
  title,
  count,
  icon,
  action,
  children,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex h-8 flex-1 items-center gap-1.5 rounded-xs px-2 text-left outline-none focus-visible:bg-zebra"
        >
          <ChevronDown
            className={cn(
              "size-3.5 text-ink-muted transition-transform duration-150",
              !open && "-rotate-90",
            )}
          />
          <span className="text-ink-muted">{icon}</span>
          <span className="pn-eyebrow text-ink-muted">{title}</span>
          <span className="pn-tnum ml-auto font-mono text-[0.6875rem] text-ink-muted">{count}</span>
        </button>
        {action}
      </div>
      {open && <ul className="flex flex-col pb-2">{children}</ul>}
    </section>
  );
}

function RelationItem({
  relation,
  dbId,
  onNavigate,
}: {
  relation: RelationInfo;
  dbId: string;
  onNavigate?(): void;
}) {
  const openTable = useWorkspace((s) => s.openTable);
  const active = useWorkspace((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.kind === "table" && tab.table === relation.name;
  });
  const openDialog = useDialogs((s) => s.open);
  const count = useTableCount(dbId, relation.name, relation.kind !== "virtual");
  const Icon = relation.kind === "view" ? Eye : Table;
  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={() => {
          openTable(relation.name, { mode: "data" });
          onNavigate?.();
        }}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-xs pr-9 pl-7 text-left text-sm outline-none hover:bg-zebra focus-visible:bg-zebra",
          active ? "bg-sky-wash font-medium text-ink" : "text-ink-soft",
        )}
        aria-current={active ? "page" : undefined}
      >
        <Icon className={cn("size-3.5 shrink-0", active ? "text-sky-ink" : "text-ink-muted")} />
        <span className="truncate">{relation.name}</span>
        {count.data !== undefined && (
          <span className="pn-tnum ml-auto font-mono text-[0.6875rem] text-ink-muted">
            {formatCount(count.data)}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-xs text-ink-muted opacity-0 outline-none group-hover/item:opacity-100 hover:bg-raised focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
          aria-label={`Actions for ${relation.name}`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem
            onSelect={() => {
              openTable(relation.name, { mode: "data" });
              onNavigate?.();
            }}
          >
            <Table /> Browse data
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              openTable(relation.name, { mode: "structure" });
              onNavigate?.();
            }}
          >
            <TableProperties /> Structure
          </DropdownMenuItem>
          {relation.kind === "table" && (
            <>
              <DropdownMenuItem
                onSelect={() => openDialog({ kind: "addColumn", table: relation.name })}
              >
                <Plus /> Add column
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openDialog({ kind: "createIndex", table: relation.name })}
              >
                <ListTree /> Create index
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openDialog({ kind: "import", table: relation.name })}
              >
                <Upload /> Import rows
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openDialog({ kind: "renameTable", table: relation.name })}
              >
                <Pencil /> Rename
              </DropdownMenuItem>
            </>
          )}
          {relation.sql && (
            <DropdownMenuItem
              onSelect={() => openDialog({ kind: "ddl", title: relation.name, sql: relation.sql! })}
            >
              <FileCode /> Show SQL
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function SavedQueryItem({ query, onNavigate }: { query: SavedQuery; onNavigate?(): void }) {
  const openQuery = useWorkspace((s) => s.openQuery);
  const active = useWorkspace((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.kind === "query" && tab.savedId === query.id;
  });
  const openDialog = useDialogs((s) => s.open);
  const actions = useSavedQueryActions();
  const open = () => {
    openQuery(query.sql, { id: query.id, name: query.name });
    onNavigate?.();
  };
  return (
    <li className="group/item relative">
      <button
        type="button"
        onClick={open}
        title={query.sql}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-xs pr-9 pl-7 text-left text-sm outline-none hover:bg-zebra focus-visible:bg-zebra",
          active ? "bg-lilac-wash font-medium text-ink" : "text-ink-soft",
        )}
        aria-current={active ? "page" : undefined}
      >
        <SquareTerminal
          className={cn("size-3.5 shrink-0", active ? "text-lilac-ink" : "text-ink-muted")}
        />
        <span className="truncate">{query.name}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-xs text-ink-muted opacity-0 outline-none group-hover/item:opacity-100 hover:bg-raised focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
          aria-label={`Actions for ${query.name}`}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={open}>
            <SquareTerminal /> Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              openDialog({ kind: "renameSavedQuery", id: query.id, name: query.name })
            }
          >
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(query.id)}>
            <Trash /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function ObjectItem({ object, icon }: { object: SchemaObject; icon: ReactNode }) {
  const openDialog = useDialogs((s) => s.open);
  return (
    <li>
      <button
        type="button"
        disabled={!object.sql}
        onClick={() =>
          object.sql && openDialog({ kind: "ddl", title: object.name, sql: object.sql })
        }
        className="flex h-8 w-full items-center gap-2 rounded-xs pr-2 pl-7 text-left text-sm text-ink-soft outline-none hover:bg-zebra focus-visible:bg-zebra"
      >
        <span className="text-ink-muted">{icon}</span>
        <span className="truncate">{object.name}</span>
        <span className="ml-auto truncate font-mono text-[0.6875rem] text-ink-muted">
          {object.table}
        </span>
      </button>
    </li>
  );
}

interface SidebarProps {
  dbId: string | null;
  schema: Schema | undefined;
  /** Called after navigation (closes the mobile sheet). */
  onNavigate?(): void;
  className?: string;
}

export function Sidebar({ dbId, schema, onNavigate, className }: SidebarProps) {
  const openQuery = useWorkspace((s) => s.openQuery);
  const openDialog = useDialogs((s) => s.open);
  const savedQueries = useSavedQueries((s) => s.queries);

  return (
    <nav aria-label="Database" className={cn("flex h-full min-h-0 flex-col bg-surface", className)}>
      <div className="flex h-12 items-center gap-2 border-b-2 border-hairline px-3">
        <span className="font-semibold tracking-[-0.015em] text-ink">Editor</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.vis}>
              <Network /> Schema
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>

      <div className="border-b-2 border-hairline p-2">
        <DatabaseSwitcher dbId={dbId} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {dbId && schema && (
          <>
            <Group
              title="Tables"
              count={schema.tables.length}
              icon={<Table className="size-3.5" />}
              action={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="New table"
                  onClick={() => openDialog({ kind: "createTable" })}
                >
                  <Plus />
                </Button>
              }
            >
              {schema.tables.map((t) => (
                <RelationItem key={t.name} relation={t} dbId={dbId} onNavigate={onNavigate} />
              ))}
              {schema.tables.length === 0 && (
                <li className="px-7 py-1 text-sm text-ink-muted">
                  No tables yet.{" "}
                  <button
                    type="button"
                    className="text-sky-ink underline-offset-2 hover:underline"
                    onClick={() => openDialog({ kind: "createTable" })}
                  >
                    Create one
                  </button>
                </li>
              )}
            </Group>
            {schema.views.length > 0 && (
              <Group title="Views" count={schema.views.length} icon={<Eye className="size-3.5" />}>
                {schema.views.map((v) => (
                  <RelationItem key={v.name} relation={v} dbId={dbId} onNavigate={onNavigate} />
                ))}
              </Group>
            )}
            {savedQueries.length > 0 && (
              <Group
                title="Saved queries"
                count={savedQueries.length}
                icon={<Bookmark className="size-3.5" />}
              >
                {savedQueries.map((q) => (
                  <SavedQueryItem key={q.id} query={q} onNavigate={onNavigate} />
                ))}
              </Group>
            )}
            {schema.indexes.length > 0 && (
              <Group
                title="Indexes"
                count={schema.indexes.length}
                icon={<ListTree className="size-3.5" />}
              >
                {schema.indexes.map((o) => (
                  <ObjectItem key={o.name} object={o} icon={<ListTree className="size-3.5" />} />
                ))}
              </Group>
            )}
            {schema.triggers.length > 0 && (
              <Group
                title="Triggers"
                count={schema.triggers.length}
                icon={<Zap className="size-3.5" />}
              >
                {schema.triggers.map((o) => (
                  <ObjectItem key={o.name} object={o} icon={<Zap className="size-3.5" />} />
                ))}
              </Group>
            )}
          </>
        )}
      </div>

      {dbId && (
        <div className="flex gap-2 border-t-2 border-hairline p-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              openQuery();
              onNavigate?.();
            }}
          >
            <SquareTerminal /> New query
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Import CSV or JSON"
            onClick={() => openDialog({ kind: "import" })}
          >
            <Upload />
          </Button>
        </div>
      )}
    </nav>
  );
}
