import { useState } from "react";
import { toast } from "@/components/atoms/toast";
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
import { getSqlite } from "@/lib/sqlite/client";
import { errorMessage } from "@/lib/sqlite/errors";
import type { Schema, DbInfo } from "@/types/lib/sqlite/types";
import { draftStatements, newDatabaseStatements } from "@/features/vis/lib/model";
import type { Draft } from "@/types/features/vis/lib/model";

interface SaveAsDialogProps {
  /** The open database. */
  source: { id: string; name: string };
  schema: Schema | undefined;
  draft: Draft;
  onSaved(info: DbInfo): void;
  onClose(): void;
}

/** Creates a separate database from the current schema plus the design; the source is untouched. */
export function SaveAsDialog({ source, schema, draft, onSaved, onClose }: SaveAsDialogProps) {
  const [name, setName] = useState(`${source.name} (new)`);
  const [copyRows, setCopyRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const tables =
    (schema?.tables.filter((t) => t.name !== "sqlite_sequence").length ?? 0) + draft.tables.length;

  const save = async () => {
    setBusy(true);
    try {
      const api = getSqlite();
      // With rows: a full dump of the source, then the design. Without: schema only.
      const script = copyRows
        ? `${await api.dump(source.id)}\n${draftStatements(draft).join("\n")}`
        : newDatabaseStatements(schema, draft).join("\n");
      const info = await api.createDatabase(name.trim(), script);
      onSaved(info);
      onClose();
    } catch (error) {
      toast.error(`Nothing was created: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Save as a new database</DialogTitle>
            <DialogDescription>
              {`A new database with ${source.name}'s schema and your changes. ${source.name} stays exactly as it is.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="save-as-name">Database name</Label>
            <Input
              id="save-as-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={copyRows}
              onCheckedChange={(v) => setCopyRows(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-ink">Copy the existing rows too</span>
              <span className="block text-ink-muted">
                Leave this off to start with empty tables.
              </span>
            </span>
          </label>
          <p className="text-xs text-ink-muted">
            {tables} {tables === 1 ? "table" : "tables"}, including {draft.tables.length} new
            {Object.keys(draft.addedColumns).length > 0 && ", with your new columns"}.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create database"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
