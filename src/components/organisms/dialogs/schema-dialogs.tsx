import { ArrowDown, ArrowUp, Plus, Trash } from "@/components/atoms/icons";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/atoms/button";
import { Checkbox } from "@/components/atoms/checkbox";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { useRunStatements, useSchema } from "@/hooks/use-db";
import {
  buildAddColumn,
  buildCreateIndex,
  buildCreateTable,
  emptyColumn,
  type ColumnDef,
} from "@/lib/sqlite/ddl";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/utils";
import { Check, ColumnFields } from "./column-fields";
import { SqlPreview } from "./simple-dialogs";

function useTableList() {
  const dbId = useWorkspace((s) => s.dbId);
  const schema = useSchema(dbId);
  return (schema.data?.tables ?? [])
    .filter((t) => t.kind === "table" && t.name !== "sqlite_sequence")
    .map((t) => ({ name: t.name, columns: t.columns.map((c) => c.name) }));
}

function tryBuild(build: () => string): { sql: string | null; problem: string | null } {
  try {
    return { sql: build(), problem: null };
  } catch (error) {
    return { sql: null, problem: error instanceof Error ? error.message : String(error) };
  }
}

function SchemaDialogFrame({
  title,
  description,
  sql,
  problem,
  submitLabel,
  onSubmit,
  onClose,
  busy,
  children,
  wide,
}: {
  title: string;
  description: string;
  sql: string | null;
  problem: string | null;
  submitLabel: string;
  onSubmit(): void;
  onClose(): void;
  busy: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      {/* Header and footer stay put; only the fields between them scroll. */}
      <ResponsiveDialogContent
        className={cn(
          "flex max-h-[90dvh] flex-col gap-0 p-0",
          wide ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (sql) onSubmit();
          }}
        >
          <DialogHeader className="border-b-2 border-hairline p-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
            {children}
            {sql && <SqlPreview sql={sql} />}
          </div>
          <DialogFooter className="m-0 sm:items-center">
            {/* Until the form is complete there's no SQL to preview; say what's missing instead.
                In a phone drawer it takes its own line above the buttons. */}
            {!sql && problem && (
              <p
                role="status"
                className="basis-full text-xs text-ink-muted sm:mr-auto sm:basis-auto"
              >
                {problem}
              </p>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!sql || busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function CreateTableDialog({ onClose }: { onClose(): void }) {
  const tables = useTableList();
  const openTable = useWorkspace((s) => s.openTable);
  const run = useRunStatements();
  const [name, setName] = useState("");
  const [withoutRowid, setWithoutRowid] = useState(false);
  const [strict, setStrict] = useState(false);
  const [columns, setColumns] = useState<ColumnDef[]>([
    { ...emptyColumn("id"), type: "INTEGER", primaryKey: true },
    emptyColumn(""),
  ]);
  const built = tryBuild(() => buildCreateTable({ name, columns, withoutRowid, strict }));

  const move = (i: number, by: number) =>
    setColumns((cols) => {
      const next = [...cols];
      const [c] = next.splice(i, 1);
      next.splice(i + by, 0, c);
      return next;
    });

  return (
    <SchemaDialogFrame
      wide
      title="New table"
      description="Define the columns. You can add more later."
      sql={built.sql}
      problem={built.problem}
      submitLabel="Create table"
      busy={run.isPending}
      onClose={onClose}
      onSubmit={() =>
        run.mutate(
          {
            statements: [{ sql: built.sql!, params: [] }],
            schema: true,
            success: `Created ${name.trim()}`,
          },
          {
            onSuccess: () => {
              onClose();
              openTable(name.trim());
            },
          },
        )
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="table-name">Table name</Label>
        <Input
          id="table-name"
          autoFocus
          placeholder="customers"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-mono max-md:text-base"
        />
      </div>
      <section className="flex flex-col gap-2" aria-labelledby="table-columns">
        <h3 id="table-columns" className="pn-eyebrow text-ink-muted">
          Columns <span className="pn-tnum">· {columns.length}</span>
        </h3>
        {columns.map((col, i) => (
          <ColumnFields
            key={i}
            col={col}
            mode="create"
            tables={tables}
            onChange={(c) => setColumns((cols) => cols.map((x, j) => (j === i ? c : x)))}
            actions={
              <span className="flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={i === columns.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove column"
                  disabled={columns.length === 1}
                  onClick={() => setColumns((cols) => cols.filter((_, j) => j !== i))}
                >
                  <Trash />
                </Button>
              </span>
            }
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setColumns((c) => [...c, emptyColumn("")])}
        >
          <Plus /> Add column
        </Button>
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="table-options">
        <h3 id="table-options" className="pn-eyebrow text-ink-muted">
          Table options
        </h3>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Check label="WITHOUT ROWID" checked={withoutRowid} onChange={setWithoutRowid} />
          <Check label="STRICT typing" checked={strict} onChange={setStrict} />
        </div>
      </section>
    </SchemaDialogFrame>
  );
}

export function AddColumnDialog({ table, onClose }: { table: string; onClose(): void }) {
  const tables = useTableList();
  const run = useRunStatements();
  const [col, setCol] = useState<ColumnDef>(emptyColumn(""));
  const built = tryBuild(() => buildAddColumn(table, col));
  return (
    <SchemaDialogFrame
      title={`Add a column to ${table}`}
      description="Existing rows get the default value (or NULL)."
      sql={built.sql}
      problem={built.problem}
      submitLabel="Add column"
      busy={run.isPending}
      onClose={onClose}
      onSubmit={() =>
        run.mutate(
          {
            statements: [{ sql: built.sql!, params: [] }],
            schema: true,
            success: `Added ${col.name.trim()}`,
          },
          { onSuccess: onClose },
        )
      }
    >
      <ColumnFields layout="form" col={col} onChange={setCol} tables={tables} mode="add" />
    </SchemaDialogFrame>
  );
}

export function CreateIndexDialog({ table, onClose }: { table: string; onClose(): void }) {
  const tables = useTableList();
  const columns = tables.find((t) => t.name === table)?.columns ?? [];
  const run = useRunStatements();
  const [picked, setPicked] = useState<{ name: string; desc: boolean }[]>([]);
  const [unique, setUnique] = useState(false);
  const [where, setWhere] = useState("");
  const defaultName = `${table}_${picked.map((p) => p.name).join("_") || "idx"}`.replace(
    /\W+/g,
    "_",
  );
  const [name, setName] = useState<string | null>(null);
  const indexName = name ?? defaultName;
  const built = tryBuild(() =>
    buildCreateIndex({ name: indexName, table, columns: picked, unique, where }),
  );

  return (
    <SchemaDialogFrame
      title={`Create an index on ${table}`}
      description="Pick columns in the order queries filter or sort by them."
      sql={built.sql}
      problem={built.problem}
      submitLabel="Create index"
      busy={run.isPending}
      onClose={onClose}
      onSubmit={() =>
        run.mutate(
          {
            statements: [{ sql: built.sql!, params: [] }],
            schema: true,
            success: `Created ${indexName}`,
          },
          { onSuccess: onClose },
        )
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="index-name">Index name</Label>
        <Input
          id="index-name"
          value={indexName}
          onChange={(e) => setName(e.target.value)}
          className="font-mono max-md:text-base"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="pn-eyebrow mb-2 text-ink-muted">Columns</legend>
        <ul className="flex flex-col gap-1">
          {columns.map((c) => {
            const p = picked.find((x) => x.name === c);
            const position = picked.findIndex((x) => x.name === c);
            return (
              <li key={c} className="flex items-center gap-3 rounded-xs px-2 py-1 hover:bg-zebra">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!p}
                    onCheckedChange={(v) =>
                      setPicked((s) =>
                        v ? [...s, { name: c, desc: false }] : s.filter((x) => x.name !== c),
                      )
                    }
                  />
                  <span className="font-mono">{c}</span>
                  {position >= 0 && (
                    <span className="pn-tnum font-mono text-[0.6875rem] text-ink-muted">
                      #{position + 1}
                    </span>
                  )}
                </label>
                {p && (
                  <Check
                    label="Descending"
                    checked={p.desc}
                    onChange={(desc) =>
                      setPicked((s) => s.map((x) => (x.name === c ? { ...x, desc } : x)))
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <Check label="Unique" checked={unique} onChange={setUnique} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="index-where">Only rows where (optional)</Label>
        <Input
          id="index-where"
          placeholder="deleted_at IS NULL"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          className="font-mono max-md:text-base"
        />
      </div>
    </SchemaDialogFrame>
  );
}
