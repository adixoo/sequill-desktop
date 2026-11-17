import { Plus, RefreshCw, Rows2, Rows3, Search, Trash, Upload } from "@/shared/ui/icons";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/ui/input-group";
import { ScrollStrip } from "@/shared/ui/scroll-strip";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { useRowCount, useRunStatements, useTableRows } from "@/shared/hooks/use-db";
import { alignRows } from "@/shared/lib/data/grid";
import { formatCount, formatDuration, valueToText } from "@/shared/lib/data/format";
import { getSqlite } from "@/shared/lib/sqlite/client";
import {
  buildDelete,
  buildDeleteWhere,
  buildInsert,
  buildSelect,
  buildUpdate,
  type TableQuery,
} from "@/shared/lib/sqlite/sql";
import { buildDropColumn } from "@/shared/lib/sqlite/ddl";
import { isWritableColumn, visibleColumns } from "@/shared/lib/sqlite/introspect";
import type {
  CellValue,
  RelationInfo,
  Row,
  RowKey,
  Schema,
  SqlStatement,
} from "@/shared/lib/sqlite/types";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { useWorkspace, type TableViewState } from "@/shared/lib/store/workspace";
import { DataGrid } from "@/features/editor/grid/data-grid";
import type { CellEdit, GridColumn } from "@/features/editor/grid/types";
import { ExportMenu, type ExportSource } from "@/features/editor/export-menu";
import { ColumnsMenu } from "./columns-menu";
import { FilterBuilder } from "./filter-builder";
import { Pagination } from "./pagination";
import { RowInspector, type InspectorTarget } from "./row-inspector";
import { StructureView } from "./structure-view";

const EMPTY_SELECTION: ReadonlySet<number> = new Set();
let inspectorSeq = 0;
/** Data / Structure are text only, so the chosen one needs a clear fill and weight. */
const VIEW_ITEM =
  "px-3 data-[state=on]:bg-sky-wash data-[state=on]:font-medium data-[state=on]:text-ink";

interface TableViewProps {
  dbId: string;
  tabId: string;
  relation: RelationInfo;
  schema: Schema;
  view: TableViewState;
}

export function TableView({ dbId, tabId, relation, schema, view }: TableViewProps) {
  const updateView = useWorkspace((s) => s.updateView);
  const openTable = useWorkspace((s) => s.openTable);
  const density = useWorkspace((s) => s.density);
  const setDensity = useWorkspace((s) => s.setDensity);
  const openDialog = useDialogs((s) => s.open);
  const run = useRunStatements();

  // Selection belongs to the rows it was made on; new data means no selection.
  const [selectionState, setSelectionState] = useState<{
    data: unknown;
    rows: ReadonlySet<number>;
    all: boolean;
  }>({
    data: null,
    rows: new Set(),
    all: false,
  });
  const [inspector, setInspector] = useState<InspectorTarget | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchText, setSearchText] = useState(view.search);
  const search = useDeferredValue(searchText);

  const columns = useMemo(() => visibleColumns(relation), [relation]);
  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);
  const pkColumns = useMemo(
    () => columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk),
    [columns],
  );

  const query: TableQuery = useMemo(
    () => ({
      table: relation.name,
      columns: columnNames,
      rowidName: relation.rowidName,
      filters: view.filters,
      match: view.match,
      search: view.search,
      sort: view.sort,
      limit: view.pageSize,
      offset: view.page * view.pageSize,
    }),
    [
      relation,
      columnNames,
      view.filters,
      view.match,
      view.search,
      view.sort,
      view.page,
      view.pageSize,
    ],
  );

  const rowsQuery = useTableRows(dbId, query);
  const countQuery = useRowCount(dbId, query);
  const total = countQuery.data ?? 0;

  // Debounced search: the deferred value lands in the view (and the query) once typing settles.
  useEffect(() => {
    if (search === view.search) return;
    const t = setTimeout(() => updateView(tabId, { search, page: 0 }), 250);
    return () => clearTimeout(t);
  }, [search, view.search, tabId, updateView]);

  // Matched by name: the rows on screen may be from before the table's columns changed.
  const { rows, keys } = useMemo(
    () =>
      rowsQuery.data
        ? alignRows(rowsQuery.data, columnNames)
        : { rows: [] as Row[], keys: [] as CellValue[] },
    [rowsQuery.data, columnNames],
  );

  const current = selectionState.data === rowsQuery.data;
  const selection = current ? selectionState.rows : EMPTY_SELECTION;
  const allMatching = current && selectionState.all;
  const setSelection = (rows: Set<number>) =>
    setSelectionState({ data: rowsQuery.data, rows, all: false });
  const setAllMatching = (all: boolean) =>
    setSelectionState({ data: rowsQuery.data, rows: selection, all });

  const gridColumns: GridColumn[] = useMemo(
    () =>
      columns.map((c) => ({
        name: c.name,
        type: c.type,
        pk: c.pk > 0,
        fk: relation.foreignKeys.find((k) => k.from === c.name) ?? null,
        editable: relation.editable && isWritableColumn(c),
      })),
    [columns, relation],
  );

  const keyOf = (rowIndex: number, row: Row = rows[rowIndex]): RowKey => {
    if (relation.rowidName)
      return { kind: "rowid", name: relation.rowidName, value: keys[rowIndex] };
    return {
      kind: "pk",
      values: pkColumns.map((c) => ({ column: c.name, value: row[columnNames.indexOf(c.name)] })),
    };
  };

  const patch = (p: Partial<TableViewState>) => updateView(tabId, p);
  const execute = (statements: SqlStatement[], success?: string, schemaChange = false) =>
    run.mutateAsync({ statements, success, schema: schemaChange }).then(
      () => true,
      () => false,
    );

  const onEdit = (edits: CellEdit[]) => {
    const statements = edits.map((e) =>
      buildUpdate(relation.name, [{ column: e.column, value: e.value }], keyOf(e.row)),
    );
    return execute(statements);
  };

  const confirmDelete = (indexes: number[]) => {
    const statements = allMatching
      ? [buildDeleteWhere(query)]
      : buildDelete(
          relation.name,
          indexes.map((i) => keyOf(i)),
        );
    const count = allMatching ? total : indexes.length;
    openDialog({
      kind: "confirm",
      title: `Delete ${formatCount(count)} ${count === 1 ? "row" : "rows"}?`,
      description: `This permanently removes ${count === 1 ? "the row" : "these rows"} from ${relation.name}. Download the database first if you may need them.`,
      statements,
      confirmLabel: "Delete",
      success: `Deleted ${formatCount(count)} ${count === 1 ? "row" : "rows"}`,
      destructive: true,
    });
    setInspector(null);
  };

  const followForeignKey = (column: string, value: CellValue) => {
    const fk = relation.foreignKeys.find((k) => k.from === column);
    if (!fk) return;
    const parent = schema.tables.find((t) => t.name === fk.table);
    const target = fk.to ?? parent?.columns.find((c) => c.pk === 1)?.name ?? parent?.rowidName;
    if (!target) return;
    openTable(fk.table, {
      filters: [{ id: "fk", column: target, op: "eq", value: valueToText(value) }],
      page: 0,
      mode: "data",
    });
  };

  const exportSources: ExportSource[] = [
    {
      label:
        view.filters.length > 0 || view.search
          ? `All ${formatCount(total)} matching rows`
          : `All ${formatCount(total)} rows`,
      load: async () => {
        const { sql, params } = buildSelect({ ...query, rowidName: null, limit: -1, offset: 0 });
        return getSqlite().query(dbId, sql, params);
      },
    },
    ...(selection.size > 0
      ? [
          {
            label: `${formatCount(selection.size)} selected rows`,
            load: async () => ({
              columns: columnNames,
              rows: [...selection].sort((a, b) => a - b).map((i) => rows[i]),
            }),
          },
        ]
      : []),
  ];

  const result = rowsQuery.data;
  const selectedCount = allMatching ? total : selection.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Phones: the view switch and a sideways-scrolling row of actions, with search below.
          Wider screens: all on one line. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b-2 border-hairline bg-surface px-2 py-1.5">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view.mode}
          onValueChange={(v) => v && patch({ mode: v as TableViewState["mode"] })}
          aria-label="View"
          className="shrink-0"
        >
          <ToggleGroupItem value="data" className={VIEW_ITEM}>
            Data
          </ToggleGroupItem>
          <ToggleGroupItem value="structure" className={VIEW_ITEM}>
            Structure
          </ToggleGroupItem>
        </ToggleGroup>

        {view.mode === "data" && (
          <>
            <InputGroup className="order-last h-8 basis-full sm:order-none sm:w-56 sm:shrink-0 sm:basis-auto">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                placeholder="Search all columns"
                aria-label={`Search ${relation.name}`}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="max-md:text-base"
              />
            </InputGroup>
            <ScrollStrip
              fade="surface"
              scrollLabel="actions"
              role="toolbar"
              aria-label={`${relation.name} actions`}
              className="items-center gap-1 *:shrink-0"
            >
              <FilterBuilder
                columns={columnNames}
                filters={view.filters}
                match={view.match}
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                onChange={(filters, match) => patch({ filters, match, page: 0 })}
              />
              <ColumnsMenu columns={columnNames} layout={view} onChange={patch} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
              >
                {density === "compact" ? <Rows3 /> : <Rows2 />}
                {density === "compact" ? "Comfortable" : "Compact"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void rowsQuery.refetch();
                  void countQuery.refetch();
                }}
              >
                <RefreshCw className={rowsQuery.isFetching ? "animate-spin" : undefined} />
                Refresh
              </Button>

              <div className="ml-auto flex items-center gap-1 *:shrink-0">
                {selectedCount > 0 && relation.editable && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => confirmDelete([...selection])}
                  >
                    <Trash /> Delete {formatCount(selectedCount)}
                  </Button>
                )}
                {relation.editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDialog({ kind: "import", table: relation.name })}
                  >
                    <Upload /> Import
                  </Button>
                )}
                <ExportMenu name={relation.name} sources={exportSources} disabled={total === 0} />
                {relation.editable && (
                  <Button
                    size="sm"
                    onClick={() => setInspector({ kind: "new", id: ++inspectorSeq })}
                  >
                    <Plus /> Add row
                  </Button>
                )}
              </div>
            </ScrollStrip>
          </>
        )}
      </div>

      {view.mode === "structure" ? (
        <StructureView relation={relation} schema={schema} />
      ) : (
        <>
          {!relation.editable && (
            <p className="border-b border-hairline bg-raised px-3 py-1.5 text-xs text-ink-muted">
              {relation.kind === "view"
                ? "Views are read-only."
                : relation.kind === "virtual"
                  ? "Virtual tables are read-only here."
                  : "This table has no rowid or primary key, so rows can't be edited."}
            </p>
          )}
          {selection.size === rows.length &&
            rows.length > 0 &&
            total > rows.length &&
            relation.editable && (
              <p className="flex flex-wrap items-center justify-center gap-2 border-b border-hairline bg-sky-wash px-3 py-1.5 text-xs text-ink">
                {allMatching ? (
                  <>
                    All {formatCount(total)} matching rows are selected.
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-sky-ink"
                      onClick={() => setAllMatching(false)}
                    >
                      Select only this page
                    </Button>
                  </>
                ) : (
                  <>
                    All {formatCount(rows.length)} rows on this page are selected.
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-sky-ink"
                      onClick={() => setAllMatching(true)}
                    >
                      Select all {formatCount(total)} matching rows
                    </Button>
                  </>
                )}
              </p>
            )}
          {rowsQuery.error && (
            <p
              role="alert"
              className="border-b border-hairline bg-rose-wash px-3 py-2 text-sm text-rose-ink"
            >
              {rowsQuery.error.message}
            </p>
          )}
          <DataGrid
            label={`${relation.name} rows`}
            columns={gridColumns}
            rows={rows}
            rowOffset={view.page * view.pageSize}
            layout={view}
            onLayoutChange={patch}
            sort={view.sort}
            onSortChange={(sort) => patch({ sort, page: 0 })}
            selection={selection}
            onSelectionChange={setSelection}
            onEdit={relation.editable ? onEdit : undefined}
            onOpenRow={(i) =>
              setInspector({
                kind: "edit",
                id: ++inspectorSeq,
                row: rows[i],
                index: view.page * view.pageSize + i,
              })
            }
            onDuplicateRow={
              relation.editable
                ? (i) => setInspector({ kind: "new", id: ++inspectorSeq, initial: rows[i] })
                : undefined
            }
            onDeleteRows={relation.editable ? confirmDelete : undefined}
            onFilterByValue={(column, value) =>
              patch({
                filters: [
                  ...view.filters,
                  {
                    id: Math.random().toString(36).slice(2, 9),
                    column,
                    op: value === null ? "null" : "eq",
                    value: valueToText(value),
                  },
                ],
                page: 0,
              })
            }
            onFollowForeignKey={followForeignKey}
            onColumnAction={(action, column) => {
              if (action === "filter") {
                patch({
                  filters: [
                    ...view.filters,
                    {
                      id: Math.random().toString(36).slice(2, 9),
                      column,
                      op: "contains",
                      value: "",
                    },
                  ],
                });
                setFiltersOpen(true);
              } else if (action === "rename")
                openDialog({ kind: "renameColumn", table: relation.name, column });
              else
                openDialog({
                  kind: "confirm",
                  title: `Drop column ${column}?`,
                  description:
                    "The column and all its values are removed. Indexes or views that use it must be dropped first.",
                  statements: [{ sql: buildDropColumn(relation.name, column), params: [] }],
                  confirmLabel: "Drop column",
                  success: `Dropped ${column}`,
                  schema: true,
                  destructive: true,
                });
            }}
            density={density}
            loading={rowsQuery.isLoading}
            empty={
              view.filters.length > 0 || view.search ? (
                <span>
                  No rows match.{" "}
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto p-0"
                    onClick={() => {
                      setSearchText("");
                      patch({ filters: [], search: "", page: 0 });
                    }}
                  >
                    Clear filters
                  </Button>
                </span>
              ) : (
                "This table is empty."
              )
            }
          />
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-hairline bg-surface px-3 py-1">
            <p className="pn-tnum text-xs text-ink-muted" aria-live="polite">
              {formatCount(total)} {total === 1 ? "row" : "rows"}
              {selectedCount > 0 && ` · ${formatCount(selectedCount)} selected`}
              {result && ` · ${formatDuration(result.durationMs)}`}
            </p>
            <Pagination
              page={view.page}
              pageSize={view.pageSize}
              total={total}
              onPageChange={(page) => patch({ page })}
              onPageSizeChange={(pageSize) => patch({ pageSize, page: 0 })}
            />
          </footer>
        </>
      )}

      <RowInspector
        relation={relation}
        target={inspector}
        onClose={() => setInspector(null)}
        onSave={(values) => {
          if (inspector?.kind === "edit") {
            const index = inspector.index - view.page * view.pageSize;
            return execute(
              [buildUpdate(relation.name, values, keyOf(index, inspector.row))],
              "Row saved",
            );
          }
          return execute([buildInsert(relation.name, values)], "Row added");
        }}
        onDelete={
          inspector?.kind === "edit"
            ? () => confirmDelete([inspector.index - view.page * view.pageSize])
            : undefined
        }
        onFollowForeignKey={(c, v) => {
          setInspector(null);
          followForeignKey(c, v);
        }}
      />
    </div>
  );
}
