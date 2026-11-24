import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/atoms/dialog";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { NameDialog } from "@/components/organisms/dialogs/simple-dialogs";
import { useDbActions } from "@/hooks/use-db-actions";
import { storagePlace } from "@/lib/platform";
import type { Dialect } from "@/features/vis/lib/dialects";
import { DialectTiles } from "./import-schema-dialog";

/**
 * A new database for the schema designer: first which database it is for, then its name.
 * SQLite makes a database the editor opens too; any other makes a design only the designer has.
 */
export function NewDatabaseDialog({ onClose }: { onClose(): void }) {
  const [dialect, setDialect] = useState<Dialect | null>(null);
  const actions = useDbActions();

  if (dialect) {
    const sqlite = dialect.value === "sqlite";
    return (
      <NameDialog
        title={`New ${dialect.label} database`}
        description={
          sqlite
            ? `An empty database, stored ${storagePlace()}. The editor opens it too.`
            : `An empty design for ${dialect.label}, kept in the schema designer. Export its SQL to make the database.`
        }
        label="Name"
        initial=""
        submitLabel="Create"
        onSubmit={async (name) => {
          if (sqlite) await actions.createEmpty(name);
          else await actions.createDesign(name, dialect.value);
          return true;
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto md:max-w-3xl md:p-6">
        <DialogHeader>
          <DialogTitle>New database</DialogTitle>
          <DialogDescription>Which database is it for?</DialogDescription>
        </DialogHeader>
        <DialectTiles onPick={setDialect} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
