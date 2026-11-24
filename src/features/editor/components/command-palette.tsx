import {
  Database,
  Download,
  Eye,
  FileCode,
  FolderOpen,
  Lightbulb,
  Moon,
  Network,
  Plus,
  Sparkles,
  SquareTerminal,
  Sun,
  Table,
  TableProperties,
  Upload,
} from "@/components/atoms/icons";
import { navigate, ROUTES } from "@/lib/router";
import { useTheme } from "@/lib/theme";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/atoms/command";
import { useDbActions } from "@/hooks/use-db-actions";
import { useDatabases } from "@/hooks/use-db";
import type { Schema } from "@/types/lib/sqlite/types";
import { useDialogs } from "@/store/dialogs";
import { useSavedQueries } from "@/store/saved-queries";
import { useWorkspace } from "@/store/workspace";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  schema: Schema | undefined;
}

export default function CommandPalette({ open, onOpenChange, schema }: CommandPaletteProps) {
  const { dbId, setDb, openTable, openQuery } = useWorkspace();
  const openDialog = useDialogs((s) => s.open);
  const dbs = useDatabases();
  const actions = useDbActions();
  const { theme, setTheme } = useTheme();
  const current = dbs.data?.find((d) => d.id === dbId);
  const savedQueries = useSavedQueries((s) => s.queries);

  const runAndClose = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Jump to"
        description="Search tables, views and actions"
      >
        <Command>
          <CommandInput placeholder="Search tables, views, actions…" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {schema && schema.tables.length + schema.views.length > 0 && (
              <CommandGroup heading="Tables and views">
                {[...schema.tables, ...schema.views].map((r) => (
                  <CommandItem
                    key={r.name}
                    value={`open ${r.name}`}
                    onSelect={runAndClose(() => openTable(r.name, { mode: "data" }))}
                  >
                    {r.kind === "view" ? <Eye /> : <Table />}
                    {r.name}
                  </CommandItem>
                ))}
                {schema.tables.map((r) => (
                  <CommandItem
                    key={`s-${r.name}`}
                    value={`structure of ${r.name}`}
                    onSelect={runAndClose(() => openTable(r.name, { mode: "structure" }))}
                  >
                    <TableProperties />
                    Structure of {r.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {dbId && savedQueries.length > 0 && (
              <CommandGroup heading="Saved queries">
                {savedQueries.map((q) => (
                  <CommandItem
                    key={q.id}
                    value={`saved query ${q.name} ${q.id}`}
                    onSelect={runAndClose(() => openQuery(q.sql, { id: q.id, name: q.name }))}
                  >
                    <SquareTerminal /> {q.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {dbId && (
              <CommandGroup heading="Actions">
                <CommandItem onSelect={runAndClose(() => openQuery())}>
                  <SquareTerminal /> New query
                </CommandItem>
                <CommandItem onSelect={runAndClose(() => openDialog({ kind: "createTable" }))}>
                  <Plus /> New table
                </CommandItem>
                <CommandItem onSelect={runAndClose(() => openDialog({ kind: "import" }))}>
                  <Upload /> Import CSV or JSON
                </CommandItem>
                <CommandItem onSelect={runAndClose(() => navigate(ROUTES.vis))}>
                  <Network /> Open schema diagram
                </CommandItem>
                {current && (
                  <>
                    <CommandItem onSelect={runAndClose(() => void actions.download(current))}>
                      <Download /> Download {current.name}
                    </CommandItem>
                    <CommandItem onSelect={runAndClose(() => void actions.downloadDump(current))}>
                      <FileCode /> Download SQL dump
                    </CommandItem>
                  </>
                )}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Databases">
              {dbs.data
                ?.filter((d) => d.id !== dbId)
                .map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`switch to ${d.name} ${d.id}`}
                    onSelect={runAndClose(() => setDb(d.id))}
                  >
                    <Database /> Switch to {d.name}
                  </CommandItem>
                ))}
              <CommandItem onSelect={runAndClose(() => void actions.pickFile())}>
                <FolderOpen /> Open a database file
              </CommandItem>
              <CommandItem onSelect={runAndClose(() => openDialog({ kind: "newDatabase" }))}>
                <Plus /> New empty database
              </CommandItem>
              <CommandItem onSelect={runAndClose(() => void actions.createSample())}>
                <Sparkles /> Create sample database
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Appearance">
              <CommandItem
                onSelect={runAndClose(() => setTheme(theme === "dark" ? "light" : "dark"))}
              >
                {theme === "dark" ? <Sun /> : <Moon />} Switch to{" "}
                {theme === "dark" ? "light" : "dark"} mode
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Help">
              <CommandItem onSelect={runAndClose(() => openDialog({ kind: "guide" }))}>
                <Lightbulb /> Show the welcome guide
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
