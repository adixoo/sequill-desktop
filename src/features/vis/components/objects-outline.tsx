import { useState } from "react";
import { Button } from "@/components/atoms/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import { Plus, RotateCcw, Trash, Undo } from "@/components/atoms/icons";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Textarea } from "@/components/atoms/textarea";
import type { ExtraObject } from "@/lib/sqlite/types";
import { cn } from "@/utils";
import { dialectOf, OBJECT_KINDS, type ObjectKind } from "@/features/vis/lib/dialects";
import { enumValues, objectKey, revertObject, setObject } from "@/features/vis/lib/model";
import type { SchemaEditor } from "./column-editor";

/** One object as the outline shows it: its key in the draft and what the draft does to it. */
interface Entry {
  key: string;
  object: ExtraObject;
  state: "same" | "changed" | "new" | "deleted";
}

/** The imported schema's objects with the draft's changes, stored ones first. */
function entries(editor: SchemaEditor): Entry[] {
  const stored = editor.schema?.objects ?? [];
  const storedKeys = new Set(stored.map(objectKey));
  return [
    ...stored.map((o): Entry => {
      const key = objectKey(o);
      if (!(key in editor.draft.objects)) return { key, object: o, state: "same" };
      const next = editor.draft.objects[key];
      return next ? { key, object: next, state: "changed" } : { key, object: o, state: "deleted" };
    }),
    ...Object.entries(editor.draft.objects)
      .filter(([key, o]) => !storedKeys.has(key) && o !== null)
      .map(([key, o]): Entry => ({ key, object: o!, state: "new" })),
  ];
}

const label = (kind: string, plural = false) => {
  const known = OBJECT_KINDS[kind as ObjectKind];
  return known ? (plural ? known.many : known.one) : kind;
};

/**
 * The outline's part for a schema imported from another database: its enums, functions,
 * procedures, triggers, views, sequences and types, grouped by kind. Each opens an editor;
 * "Add" offers the kinds that database has. Renders nothing for a SQLite design.
 */
export function ObjectsOutline({ editor }: { editor: SchemaEditor }) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const dialect = dialectOf(editor.schema?.dialect);
  if (!editor.schema?.dialect) return null;
  const all = entries(editor);
  const kinds = [...(dialect?.objectKinds ?? []), ...new Set(all.map((e) => e.object.kind))].filter(
    (k, i, list) => list.indexOf(k) === i,
  );
  const add = (kind: string) =>
    setEditing({
      key: "",
      state: "new",
      object: { kind, name: "", table: null, body: kind === "enum" ? "[]" : "" },
    });

  return (
    <li className="mt-3 border-t-2 border-hairline pt-2" aria-label="Other objects">
      <div className="flex h-8 items-center gap-2 px-2">
        <span className="text-xs font-semibold text-ink-muted">
          {dialect?.label ?? editor.schema.dialect} objects
        </span>
        {kinds.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Add an object">
                <Plus />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(dialect?.objectKinds ?? []).map((kind) => (
                <DropdownMenuItem key={kind} onSelect={() => add(kind)}>
                  <Plus /> New {label(kind).toLowerCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {all.length === 0 && <p className="px-3 py-1 text-sm text-ink-muted">None yet.</p>}
      {kinds.map((kind) => {
        const ofKind = all.filter((e) => e.object.kind === kind);
        if (ofKind.length === 0) return null;
        return (
          <section key={kind} aria-label={label(kind, true)} className="mb-1">
            <h3 className="px-3 pt-1 text-xs text-ink-muted">
              {label(kind, true)} <span className="font-mono">{ofKind.length}</span>
            </h3>
            <ul>
              {ofKind.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => setEditing(entry)}
                    aria-label={`Edit ${label(kind).toLowerCase()} ${entry.object.name}`}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 rounded-xs px-3 text-left font-mono text-sm outline-none hover:bg-active focus-visible:ring-2 focus-visible:ring-ring",
                      entry.state === "deleted" && "text-ink-muted line-through",
                      entry.state === "new" && "text-mint-ink",
                      entry.state === "changed" && "text-butter-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.object.name}</span>
                    {entry.object.table && (
                      <span className="truncate text-xs text-ink-muted">
                        on {entry.object.table}
                      </span>
                    )}
                    {entry.state !== "same" && (
                      <span className="sr-only">
                        {entry.state === "deleted"
                          ? "deleted when you save"
                          : entry.state === "new"
                            ? "new"
                            : "changed"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {editing && (
        <ObjectDialog
          entry={editing}
          onSave={(object) => {
            editor.onChange(setObject(editor.draft, editing.key || objectKey(object), object));
            setEditing(null);
          }}
          onDelete={() => {
            const draft =
              editing.state === "new"
                ? revertObject(editor.draft, editing.key)
                : setObject(editor.draft, editing.key, null);
            editor.onChange(draft);
            setEditing(null);
          }}
          onRevert={() => {
            editor.onChange(revertObject(editor.draft, editing.key));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </li>
  );
}

/** Edits one object: name, table (triggers), values (enums) or SQL (everything else). */
function ObjectDialog({
  entry,
  onSave,
  onDelete,
  onRevert,
  onClose,
}: {
  entry: Entry;
  onSave(object: ExtraObject): void;
  onDelete(): void;
  onRevert(): void;
  onClose(): void;
}) {
  const { object } = entry;
  const isEnum = object.kind === "enum";
  const [name, setName] = useState(object.name);
  const [table, setTable] = useState(object.table ?? "");
  const [body, setBody] = useState(isEnum ? enumValues(object).join("\n") : object.body);
  const title = entry.key
    ? `${label(object.kind)} ${object.name}`
    : `New ${label(object.kind).toLowerCase()}`;

  const save = () =>
    onSave({
      kind: object.kind,
      name: name.trim(),
      table: object.kind === "trigger" ? table.trim() || null : null,
      body: isEnum
        ? JSON.stringify(
            body
              .split("\n")
              .map((v) => v.trim())
              .filter((v) => v !== ""),
          )
        : body.trim(),
    });

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isEnum
                ? "Its values, one per line, in order. Saved with the design."
                : "Its SQL, as your database runs it. Sequill keeps it as written and exports it to the same database; it can't run or check it."}
            </DialogDescription>
          </DialogHeader>
          {entry.state === "deleted" && (
            <p role="status" className="rounded-sm bg-rose-wash px-3 py-2 text-sm text-rose-ink">
              Deleted when you save.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="object-name">Name</Label>
            <Input
              id="object-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono"
            />
          </div>
          {object.kind === "trigger" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="object-table">Table</Label>
              <Input
                id="object-table"
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="font-mono"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="object-body">{isEnum ? "Values" : "SQL"}</Label>
            <Textarea
              id="object-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck={false}
              placeholder={isEnum ? "draft\nlive" : `CREATE ${object.kind.toUpperCase()} …`}
              className={cn("font-mono text-xs max-md:text-base", isEnum ? "h-32" : "h-64")}
            />
          </div>
          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              {entry.state === "deleted" || entry.state === "changed" ? (
                <Button type="button" variant="ghost" onClick={onRevert}>
                  {entry.state === "deleted" ? <RotateCcw /> : <Undo />}
                  {entry.state === "deleted" ? "Restore" : "Undo changes"}
                </Button>
              ) : null}
              {entry.key && entry.state !== "deleted" && (
                <Button type="button" variant="ghost" className="text-rose-ink" onClick={onDelete}>
                  <Trash /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || entry.state === "deleted"}>
                {entry.key ? "Keep changes" : "Add"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
