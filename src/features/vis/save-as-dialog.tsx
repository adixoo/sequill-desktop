import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/shared/ui/responsive-dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { getSqlite } from "@/shared/lib/sqlite/client";
import { storagePlace } from "@/shared/lib/platform";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import type { DbInfo, Schema } from "@/shared/lib/sqlite/types";
import { draftStatements, newDatabaseStatements, type Draft } from "@/features/vis/lib/model";

interface SaveAsDialogProps {
  /** The open database, or null for a blank design. */
  source: { id: string; name: string } | null;
  schema: Schema | undefined;
  draft: Draft;
  onSaved(info: DbInfo): void;
  onClose(): void;
}

/** Creates a separate database from the current schema plus the design; the source is untouched. */
export function SaveAsDialog({ source, schema, draft, onSaved, onClose }: SaveAsDialogProps) {
  const [name, setName] = useState(source ? `${source.name} (new)` : "");
  const [copyRows, setCopyRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const tables =
    (schema?.tables.filter((t) => t.name !== "sqlite_sequence").length ?? 0) + draft.tables.length;

  const save = async () => {
    setBusy(true);
    try {
      const api = getSqlite();
      // With rows: a full dump of the source, then the design. Without: schema only.
      const script =
        copyRows && source
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
              {source
                ? `A new database with ${source.name}'s schema and your changes. ${source.name} stays exactly as it is.`
                : `A new database built from this design, saved ${storagePlace()}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="save-as-name">Database name</Label>
            <Input
              id="save-as-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-md:text-base"
            />
          </div>
          {source && (
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
          )}
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
