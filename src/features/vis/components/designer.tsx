import "@xyflow/react/dist/style.css";
import "./vis.css";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  History,
  LayoutGrid,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "@/components/atoms/icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/components/atoms/toast";
import { ConfirmSqlDialog } from "@/components/organisms/dialogs/simple-dialogs";
import { Button } from "@/components/atoms/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/atoms/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { queryKeys } from "@/hooks/use-db";
import { STORAGE_KEYS } from "@/constants";
import { downloadBlob, safeFileName } from "@/utils/data/export";
import { getSqlite } from "@/lib/sqlite/client";
import { errorMessage } from "@/lib/sqlite/errors";
import type { Schema } from "@/lib/sqlite/types";
import { readJson, writeJson } from "@/lib/storage";
import { cn } from "@/utils";
import {
  carryColors,
  colorFill,
  sanitizeColors,
  setColor,
  type TableColor,
} from "@/features/vis/lib/colors";
import {
  autoLayout,
  edgeSides,
  handleColumn,
  handleId,
  nextFreePosition,
  tableHeight,
  TABLE_WIDTH,
  tableWidth,
  type Point,
} from "@/features/vis/lib/layout";
import {
  buildDiagram,
  connectColumns,
  createDraftTable,
  draftStatements,
  edgeTypeProblems,
  EMPTY_DRAFT,
  existingId,
  isDraftEmpty,
  isNewColumn,
  referenceTargets,
  saveWarnings,
  validateDraft,
  type Draft,
  newDatabaseStatements,
  changeDetails,
  currentObjects,
} from "@/features/vis/lib/model";
import { dialectOf } from "@/features/vis/lib/dialects";
import { DATA_TYPES } from "@/constants/data-types";
import type { TypeChoices } from "@/components/organisms/dialogs/type-picker";
import { isDesktop } from "@/lib/platform";
import { SaveMenu } from "./save-menu";
import { ExportSchemaMenu } from "./export-schema-menu";
import { readDraft, useStoredDraft, writeDraft } from "@/features/vis/lib/drafts";
import { SaveAsDialog } from "./save-as-dialog";
import { UnsavedBadge, type SaveState } from "./unsaved-badge";
import type { SchemaEditor } from "./column-editor";
import { SchemaOutline } from "./schema-outline";
import { TableNode, type TableNodeType } from "./table-node";
import { useDesignCheck } from "../hooks/use-design-check";

const nodeTypes = { table: TableNode };
const ARROW = { type: MarkerType.Arrow, width: 16, height: 16, color: "var(--strong)" } as const;

/** What is selected on the canvas: highlighted there and in the outline. */
type Selection = { kind: "table"; id: string } | { kind: "edge"; id: string } | null;

interface DesignerProps {
  /** The open database; its id is also the design's storage key. */
  dbId: string;
  dbName: string;
  /** The file on this computer that saving changes, for a database opened in place. */
  dbPath: string | null;
  schema: Schema | undefined;
  /** The design was saved as a new database. */
  onDatabaseCreated(id: string): void;
  /** Element in the page header where the save-state badge is shown. */
  badgeSlot: HTMLElement | null;
}

function DesignerCanvas({
  dbId,
  dbName,
  dbPath,
  schema,
  onDatabaseCreated,
  badgeSlot,
}: DesignerProps) {
  const flow = useReactFlow();
  const [justSaved, setJustSaved] = useState(false);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => readDraft(dbId));
  // An assistant can change the stored design (desktop); show its version.
  const storedDraft = useStoredDraft(dbId);
  const [seenStored, setSeenStored] = useState(storedDraft);
  if (storedDraft !== seenStored) {
    setSeenStored(storedDraft);
    setDraft(storedDraft);
  }
  const [positions, setPositions] = useState<Record<string, Point>>(() =>
    readJson(STORAGE_KEYS.visLayout + dbId, {}),
  );
  const [showViews, setShowViews] = useState(() => readJson(STORAGE_KEYS.visShowViews, true));
  const [colors, setColors] = useState<Record<string, TableColor>>(() =>
    sanitizeColors(readJson<unknown>(STORAGE_KEYS.visColors + dbId, {})),
  );
  const changeColor = (id: string, color: TableColor | null) =>
    setColors((c) => setColor(c, id, color));
  // React Flow reports each node's measured size; nodes stay hidden until we pass it back.
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [dialog, setDialog] = useState<"update" | "saveAs" | null>(null);
  /** The structure version the design was last checked against, for the save to confirm. */
  const [saveBase, setSaveBase] = useState<number | null>(null);
  // Phones: the outline is a sheet. Wide screens: a sidebar that can be hidden.
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineShown, setOutlineShown] = useState(() => readJson(STORAGE_KEYS.visOutline, true));
  const showOutline = (shown: boolean) => {
    writeJson(STORAGE_KEYS.visOutline, shown);
    setOutlineShown(shown);
  };

  useEffect(() => writeDraft(dbId, draft), [draft, dbId]);
  useEffect(() => writeJson(STORAGE_KEYS.visColors + dbId, colors), [colors, dbId]);
  // Positions change on every drag frame; save once things settle.
  useEffect(() => {
    const t = setTimeout(() => writeJson(STORAGE_KEYS.visLayout + dbId, positions), 300);
    return () => clearTimeout(t);
  }, [positions, dbId]);

  const diagram = buildDiagram(schema, draft, showViews);
  // The schema as saved (before the design), shown read-only; the design itself is kept.
  const [showOriginal, setShowOriginal] = useState(false);
  const viewingOriginal = showOriginal && !isDraftEmpty(draft);
  const shown = viewingOriginal ? buildDiagram(schema, EMPTY_DRAFT, showViews) : diagram;

  // Fit the view once, after every table has been measured (an earlier fit sees zero-size nodes).
  const fitted = useRef(false);
  const allMeasured = diagram.tables.length > 0 && diagram.tables.every((t) => sizes[t.id]);
  useEffect(() => {
    if (fitted.current || !allMeasured) return;
    fitted.current = true;
    void flow.fitView({ padding: 0.15 });
  }, [allMeasured, flow]);
  const fallback = autoLayout(
    diagram.tables.map((t) => ({ id: t.id, columns: t.columns.length, width: tableWidth(t) })),
    diagram.edges,
  );
  const positionOf = (id: string) => positions[id] ?? fallback[id] ?? { x: 0, y: 0 };

  // Focus mode: the selected table and its direct relations stay bright.
  const focus =
    selection?.kind === "table"
      ? new Set([
          selection.id,
          ...diagram.edges
            .filter((e) => e.source === selection.id || e.target === selection.id)
            .flatMap((e) => [e.source, e.target]),
        ])
      : null;

  // One editor for the outline and the table cards; both edit the same draft.
  // A schema imported from another database: its own types and enums in the type pickers.
  const dialectTypes: TypeChoices | undefined = schema?.dialect
    ? {
        label: dialectOf(schema.dialect)?.label ?? schema.dialect,
        types: DATA_TYPES[schema.dialect] ?? [],
        enums: currentObjects(schema, draft)
          .filter((o) => o.kind === "enum")
          .map((o) => o.name),
      }
    : undefined;
  const schemaEditor: SchemaEditor = {
    draft,
    schema,
    refTables: referenceTargets(diagram),
    types: dialectTypes,
    onChange: setDraft,
  };

  const widths = Object.fromEntries(shown.tables.map((t) => [t.id, tableWidth(t)]));
  const widthOf = (id: string) => widths[id] ?? TABLE_WIDTH;

  // Kept apart from positions: a drag frame re-renders only the card being moved, not every card.
  const nodeData = new Map(
    shown.tables.map((t) => [
      t.id,
      {
        table: t,
        dimmed: !!focus && !focus.has(t.id),
        color: colors[t.id] ?? null,
        editor: schemaEditor,
        readOnly: viewingOriginal,
      },
    ]),
  );

  const nodes: TableNodeType[] = shown.tables.map((t) => ({
    id: t.id,
    type: "table",
    position: positionOf(t.id),
    data: nodeData.get(t.id)!,
    measured: sizes[t.id],
    selected: selection?.kind === "table" && selection.id === t.id,
    ariaLabel: `${t.kind === "draft" ? "New table" : t.kind === "view" ? "View" : "Table"} ${t.name}`,
  }));

  const typeProblems = edgeTypeProblems(diagram);
  const edges: Edge[] = shown.edges.map((e) => {
    const active =
      selection?.kind === "edge"
        ? selection.id === e.id
        : selection?.kind === "table" && (e.source === selection.id || e.target === selection.id);
    // Leave and enter on the sides that face each other, wherever the cards are dragged.
    const sides = edgeSides(positionOf(e.source), positionOf(e.target), e.source === e.target, {
      source: widthOf(e.source),
      target: widthOf(e.target),
    });
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: handleId(sides.source, e.sourceColumn),
      targetHandle: handleId(sides.target, e.targetColumn),
      type: "smoothstep",
      pathOptions: { borderRadius: 10, offset: 28 },
      className: cn(
        e.draft && "is-draft",
        active && "is-active",
        typeProblems.has(e.id) && "is-invalid",
      ),
      markerEnd: ARROW,
      selected: selection?.kind === "edge" && selection.id === e.id,
      ariaLabel: `${e.sourceColumn} references ${e.target.slice(2)}${
        typeProblems.has(e.id) ? `. ${typeProblems.get(e.id)}` : ""
      }`,
    };
  });

  const onNodesChange = (changes: NodeChange<TableNodeType>[]) => {
    const moved: Record<string, Point> = {};
    const measured: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === "position" && c.position) moved[c.id] = c.position;
      if (c.type === "dimensions" && c.dimensions) measured[c.id] = c.dimensions;
    }
    if (Object.keys(moved).length > 0) setPositions((p) => ({ ...p, ...moved }));
    if (Object.keys(measured).length > 0) setSizes((s) => ({ ...s, ...measured }));
  };

  const onConnect = (c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return;
    const a = { table: c.source, column: handleColumn(c.sourceHandle) };
    const b = { table: c.target, column: handleColumn(c.targetHandle) };
    // Lines can be drawn either way. The key goes on a new column when one end is new
    // (it needs no table rebuild), otherwise on the column the line started from.
    const [from, to] = isNewColumn(diagram, b) && !isNewColumn(diagram, a) ? [b, a] : [a, b];
    const forward = connectColumns(draft, diagram, from, to, schema);
    const result = "error" in forward ? connectColumns(draft, diagram, to, from, schema) : forward;
    if ("error" in result) toast.error("error" in forward ? forward.error : result.error);
    else setDraft(result.draft);
  };

  /** Selects a table and pans it into the middle of the canvas. */
  const focusTable = (id: string, at: Point, columns: number) => {
    setSelection({ kind: "table", id });
    requestAnimationFrame(() =>
      flow.setCenter(at.x + widthOf(id) / 2, at.y + tableHeight(columns) / 2, {
        zoom: Math.max(flow.getZoom(), 0.8),
        duration: 400,
      }),
    );
  };

  const addTable = () => {
    const { draft: next, table } = createDraftTable(draft, schema);
    const id = `d:${table.id}`;
    const all = Object.fromEntries(diagram.tables.map((t) => [t.id, positionOf(t.id)]));
    const at = nextFreePosition(all, widths);
    setDraft(next);
    setPositions((p) => ({ ...p, [id]: at }));
    focusTable(id, at, table.columns.length);
  };

  const arrange = () => {
    setPositions(fallback);
    requestAnimationFrame(() => void flow.fitView({ padding: 0.15, duration: 400 }));
  };

  const problems = validateDraft(schema, draft);
  const statements = problems.length === 0 ? draftStatements(draft, schema) : [];
  const warnings = saveWarnings(schema, draft);
  // The design also runs on a copy of the structure, so SQLite's own errors block saving too.
  const checkError = useDesignCheck(dbId, statements);
  const saveProblems = checkError ? [...problems, `Saving would fail: ${checkError}`] : problems;

  /**
   * After saving, new tables become real ones and renamed tables get new ids:
   * both keep their place and color. Deleted tables lose theirs.
   */
  const adoptDraftLayout = (target: string) => {
    const moves = [
      ...draft.tables.map((t) => ({ from: `d:${t.id}`, to: existingId(t.name) })),
      ...Object.entries(draft.renamedTables).map(([from, to]) => ({
        from: existingId(from),
        to: existingId(to),
      })),
    ];
    const dropped = draft.droppedTables.map(existingId);
    const carried: Record<string, Point> = { ...positions };
    for (const id of dropped) delete carried[id];
    // Read every source before writing, so swapped names (a→b, b→a) don't clobber each other.
    const moved = moves.map((m) => ({ ...m, pos: positions[m.from] }));
    for (const m of moved) delete carried[m.from];
    for (const m of moved) if (m.pos) carried[m.to] = m.pos;
    const carriedColors = carryColors(
      Object.fromEntries(Object.entries(colors).filter(([id]) => !dropped.includes(id))),
      moves,
    );
    writeJson(STORAGE_KEYS.visLayout + target, carried);
    writeJson(STORAGE_KEYS.visColors + target, carriedColors);
    return { positions: carried, colors: carriedColors };
  };

  /** After the design reached this database: real tables keep their place and color. */
  const finishSave = () => {
    const adopted = adoptDraftLayout(dbId);
    setPositions(adopted.positions);
    setColors(adopted.colors);
    setDraft(EMPTY_DRAFT);
    setSelection(null);
  };

  /**
   * Checks the design on the structure copy once more, then asks before it touches the
   * database: the person sees what will change and where, and nothing is written until
   * they confirm.
   */
  const reviewSave = async () => {
    try {
      const preview = await getSqlite().previewDesign(dbId, statements);
      if (preview.error) {
        toast.error(`Nothing was saved: ${preview.error}`);
        return;
      }
      setSaveBase(preview.base);
      setDialog("update");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  /** The header badge: review and save to the open database. */
  const saveNow = async () => {
    if (saveProblems.length > 0) {
      toast.error(`Fix before saving: ${saveProblems.join(" · ")}`);
      return;
    }
    await reviewSave();
  };

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  const saveState: SaveState | null = !isDraftEmpty(draft)
    ? saveProblems.length > 0
      ? { kind: "blocked", problems: saveProblems.length }
      : { kind: "unsaved" }
    : justSaved
      ? { kind: "saved" }
      : null;

  const outline = (
    <SchemaOutline
      tables={diagram.tables}
      colors={colors}
      onColorChange={changeColor}
      selectedId={selection?.kind === "table" ? selection.id : null}
      editor={schemaEditor}
      onSelect={(id) => {
        const t = diagram.tables.find((x) => x.id === id);
        if (!t) return;
        setOutlineOpen(false);
        // Read from React Flow, not `positions`, so dragging doesn't re-render the outline.
        focusTable(id, flow.getNode(id)?.position ?? { x: 0, y: 0 }, t.columns.length);
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      {badgeSlot &&
        createPortal(
          <span className="flex items-center gap-0.5">
            {saveState && (
              <UnsavedBadge state={saveState} dbName={dbName} onClick={() => void saveNow()} />
            )}
            {!isDraftEmpty(draft) && (
              <SaveMenu
                draft={draft}
                statements={statements}
                problems={saveProblems}
                dbName={dbName}
                onUpdate={() => void reviewSave()}
                onSaveAsNew={schema?.dialect ? undefined : () => setDialog("saveAs")}
                onDownload={() =>
                  downloadBlob(
                    `${statements.join("\n\n")}\n`,
                    `${safeFileName(dbName)}-design.sql`,
                    "application/sql",
                  )
                }
                onDiscard={() => {
                  setDraft(EMPTY_DRAFT);
                  setSelection(null);
                }}
              />
            )}
            {isDesktop() && (
              <ExportSchemaMenu
                statements={() => newDatabaseStatements(schema, draft)}
                name={dbName}
              />
            )}
          </span>,
          badgeSlot,
        )}
      <aside
        aria-label="Schema outline"
        className={cn(
          "w-64 shrink-0 border-r-2 border-hairline bg-surface max-lg:hidden",
          (!outlineShown || viewingOriginal) && "lg:hidden",
        )}
      >
        {outline}
      </aside>
      <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
        <SheetContent
          side="left"
          className="w-[min(18rem,85vw)] gap-0 bg-surface p-0 lg:hidden"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Tables and columns</SheetTitle>
          {outline}
        </SheetContent>
      </Sheet>
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          className="pn-flow"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          nodesConnectable={!viewingOriginal}
          onNodeClick={(_, n) => setSelection({ kind: "table", id: n.id })}
          onEdgeClick={(_, e) => setSelection({ kind: "edge", id: e.id })}
          onPaneClick={() => setSelection(null)}
          deleteKeyCode={null}
          connectionMode={ConnectionMode.Loose}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            className="max-md:hidden!"
            nodeColor={(n) => {
              const c = colors[n.id];
              return c ? colorFill(c) : "";
            }}
          />
          <Panel
            position="top-left"
            className="flex flex-wrap gap-1 rounded-sm bg-raised p-1 ring-2 ring-hairline"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn("max-lg:hidden", viewingOriginal && "hidden")}
                  aria-label={outlineShown ? "Hide tables sidebar" : "Show tables sidebar"}
                  aria-pressed={outlineShown}
                  onClick={() => showOutline(!outlineShown)}
                >
                  {outlineShown ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{outlineShown ? "Hide sidebar" : "Show sidebar"}</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("lg:hidden", viewingOriginal && "hidden")}
              aria-label="Tables and columns"
              onClick={() => setOutlineOpen(true)}
            >
              <PanelLeftOpen />
            </Button>
            {!viewingOriginal && (
              <Button onClick={addTable}>
                <Plus /> Add table
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Auto-arrange tables"
                  onClick={arrange}
                >
                  <LayoutGrid />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Auto-arrange</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fit everything in view"
                  onClick={() => void flow.fitView({ padding: 0.15, duration: 400 })}
                >
                  <Maximize />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to screen</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showViews ? "Hide views" : "Show views"}
                  aria-pressed={showViews}
                  onClick={() => {
                    writeJson(STORAGE_KEYS.visShowViews, !showViews);
                    setShowViews(!showViews);
                  }}
                >
                  {showViews ? <Eye /> : <EyeOff />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showViews ? "Hide views" : "Show views"}</TooltipContent>
            </Tooltip>
            {!isDraftEmpty(draft) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Show the schema as saved"
                    aria-pressed={viewingOriginal}
                    onClick={() => setShowOriginal(!viewingOriginal)}
                  >
                    <History />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {viewingOriginal ? "Back to your design" : "Show the schema as saved"}
                </TooltipContent>
              </Tooltip>
            )}
          </Panel>
          {viewingOriginal && (
            <Panel
              position="top-center"
              role="status"
              className="flex items-center gap-2 rounded-sm bg-sky-wash px-3 py-1.5 text-sm text-ink ring-2 ring-hairline max-md:mt-14"
            >
              <span>The schema as saved, without your changes</span>
              <Button variant="ghost" onClick={() => setShowOriginal(false)}>
                Back to your design
              </Button>
            </Panel>
          )}
          {shown.tables.length === 0 && (
            <Panel position="top-center" className="mt-20 max-w-sm text-center">
              <p className="text-lg font-semibold text-ink">Nothing to draw yet</p>
              <p className="mt-1 text-sm text-ink-soft">Add a table to start designing a schema.</p>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {dialog === "update" && (
        <ConfirmSqlDialog
          title={`Save changes to ${dbName}?`}
          description={`${
            dbPath ? `This changes the file ${dbPath} itself.` : `This changes ${dbName} itself.`
          } Your design was checked on a copy of its structure; saving runs it on the database in one transaction, so if any statement fails, nothing changes.`}
          statements={statements.map((sql) => ({ sql, params: [] }))}
          changes={changeDetails(schema, draft)}
          confirmLabel="Save to database"
          success={`Saved to ${dbName}`}
          schema
          design
          designBase={saveBase}
          notes={warnings}
          onDone={() => {
            finishSave();
            setJustSaved(true);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "saveAs" && (
        <SaveAsDialog
          source={{ id: dbId, name: dbName }}
          schema={schema}
          draft={draft}
          onSaved={async (info) => {
            // The new database takes over the layout and colors; the design now lives there.
            adoptDraftLayout(info.id);
            setDraft(EMPTY_DRAFT);
            writeDraft(dbId, EMPTY_DRAFT);
            await queryClient.invalidateQueries({ queryKey: queryKeys.dbs });
            onDatabaseCreated(info.id);
            toast.success(`Created ${info.name}`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export function Designer(props: DesignerProps) {
  return (
    <ReactFlowProvider>
      <DesignerCanvas {...props} />
    </ReactFlowProvider>
  );
}
