import { lazyComponent } from "@/shared/components/lazy-component";
import { Loader } from "@/shared/components/pastel/loader";
import { useDbActions } from "@/shared/hooks/use-db-actions";
import { useRunStatements } from "@/shared/hooks/use-db";
import { useSavedQueryActions } from "@/shared/hooks/use-saved-queries";
import { storagePlace } from "@/shared/lib/platform";
import { buildRenameColumn, buildRenameTable } from "@/shared/lib/sqlite/ddl";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { McpDialog } from "./mcp-dialog";
import { ConfirmSqlDialog, DdlDialog, DeleteDatabaseDialog, NameDialog } from "./simple-dialogs";

const fallback = (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70">
    <Loader size="sm" label="Loading" />
  </div>
);

// Heavier dialogs (CSV parser, column builder) load on first use.
const CreateTableDialog = lazyComponent(
  () => import("./schema-dialogs").then((m) => m.CreateTableDialog),
  fallback,
);
const AddColumnDialog = lazyComponent(
  () => import("./schema-dialogs").then((m) => m.AddColumnDialog),
  fallback,
);
const CreateIndexDialog = lazyComponent(
  () => import("./schema-dialogs").then((m) => m.CreateIndexDialog),
  fallback,
);
const ImportDialog = lazyComponent(
  () => import("./import-dialog").then((m) => m.ImportDialog),
  fallback,
);

export function DialogHost() {
  const dialog = useDialogs((s) => s.dialog);
  const close = useDialogs((s) => s.close);
  const run = useRunStatements();
  const actions = useDbActions();
  const savedQueries = useSavedQueryActions();

  if (!dialog) return null;
  switch (dialog.kind) {
    case "confirm":
      return <ConfirmSqlDialog {...dialog} onClose={close} />;
    case "ddl":
      return <DdlDialog title={dialog.title} sql={dialog.sql} onClose={close} />;
    case "mcp":
      return <McpDialog onClose={close} />;
    case "deleteDatabase":
      return <DeleteDatabaseDialog db={dialog.db} onClose={close} />;
    case "createTable":
      return <CreateTableDialog onClose={close} />;
    case "addColumn":
      return <AddColumnDialog table={dialog.table} onClose={close} />;
    case "createIndex":
      return <CreateIndexDialog table={dialog.table} onClose={close} />;
    case "import":
      return <ImportDialog file={dialog.file} table={dialog.table} onClose={close} />;
    case "newDatabase":
      return (
        <NameDialog
          title="New database"
          description={`An empty database, stored ${storagePlace()}.`}
          label="Name"
          initial=""
          submitLabel="Create"
          onSubmit={async (name) => {
            await actions.createEmpty(name);
            return true;
          }}
          onClose={close}
        />
      );
    case "renameDatabase":
      return (
        <NameDialog
          title="Rename database"
          label="Name"
          initial={dialog.name}
          submitLabel="Rename"
          onSubmit={(name) => actions.rename(dialog.dbId, name)}
          onClose={close}
        />
      );
    case "renameTable":
      return (
        <NameDialog
          title={`Rename ${dialog.table}`}
          label="New name"
          initial={dialog.table}
          submitLabel="Rename"
          preview={(name) => buildRenameTable(dialog.table, name)}
          onSubmit={(name) =>
            run
              .mutateAsync({
                statements: [{ sql: buildRenameTable(dialog.table, name), params: [] }],
                schema: true,
                renamed: { from: dialog.table, to: name },
                success: `Renamed to ${name}`,
              })
              .then(
                () => true,
                () => false,
              )
          }
          onClose={close}
        />
      );
    case "saveQuery":
      return (
        <NameDialog
          title="Save query"
          description={`Saved queries are kept ${storagePlace()} and work with any database.`}
          label="Name"
          initial={dialog.suggested}
          allowUnchanged
          submitLabel="Save"
          onSubmit={async (name) => {
            savedQueries.saveAs(dialog.tabId, name);
            return true;
          }}
          onClose={close}
        />
      );
    case "renameSavedQuery":
      return (
        <NameDialog
          title="Rename saved query"
          label="Name"
          initial={dialog.name}
          submitLabel="Rename"
          onSubmit={async (name) => {
            savedQueries.rename(dialog.id, name);
            return true;
          }}
          onClose={close}
        />
      );
    case "renameColumn":
      return (
        <NameDialog
          title={`Rename ${dialog.column}`}
          description={`Column of ${dialog.table}. Indexes, views and triggers that use it are updated too.`}
          label="New name"
          initial={dialog.column}
          submitLabel="Rename"
          preview={(name) => buildRenameColumn(dialog.table, dialog.column, name)}
          onSubmit={(name) =>
            run
              .mutateAsync({
                statements: [
                  { sql: buildRenameColumn(dialog.table, dialog.column, name), params: [] },
                ],
                schema: true,
                success: `Renamed to ${name}`,
              })
              .then(
                () => true,
                () => false,
              )
          }
          onClose={close}
        />
      );
  }
}
