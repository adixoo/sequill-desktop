import { SQLite, sql as sqlLanguage } from "@codemirror/lang-sql";
import { relations } from "@/lib/sqlite/introspect";
import type { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import {
  AlertCircle,
  Check,
  CheckCircle,
  History,
  Lightbulb,
  Play,
  Save,
  Trash,
} from "@/components/atoms/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/atoms/toast";
import { Loader } from "@/components/molecules/pastel/loader";
import { Button } from "@/components/atoms/button";
import { Kbd } from "@/components/atoms/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import { Toggle } from "@/components/atoms/toggle";
import { useInvalidate } from "@/hooks/use-db";
import { useSavedQueryActions } from "@/hooks/use-saved-queries";
import { QUERY_HISTORY_LIMIT, QUERY_RESULT_ROW_LIMIT, STORAGE_KEYS } from "@/constants";
import { formatCount, formatDuration } from "@/utils/data/format";
import { getSqlite } from "@/lib/sqlite/client";
import { errorMessage } from "@/lib/sqlite/errors";
import type { Schema, StatementResult } from "@/types/lib/sqlite/types";
import { readJson, writeJson } from "@/lib/storage";
import { useSavedQueries } from "@/store/saved-queries";
import type { ColumnLayout } from "@/types/store/workspace";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/utils";
import { ExportMenu } from "@/features/editor/components/export-menu";
import { DataGrid } from "@/features/editor/components/grid/data-grid";
import { pastelEditorTheme } from "./editor-theme";

const EMPTY_LAYOUT: ColumnLayout = { hidden: [], order: [], widths: {}, pinned: [] };

function ResultView({ result }: { result: StatementResult }) {
  const density = useWorkspace((s) => s.density);
  const [layout, setLayout] = useState<ColumnLayout>(EMPTY_LAYOUT);
  const columns = result.columns.map((name) => ({ name, type: "", editable: false }));
  if (result.error) {
    return (
      <div role="alert" className="flex items-start gap-2 bg-rose-wash p-4 text-sm text-ink">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-ink" aria-hidden />
        <div>
          <p className="font-medium">Error</p>
          <p className="font-mono text-[0.8125rem]">{result.error}</p>
        </div>
      </div>
    );
  }
  if (result.columns.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-ink-soft">
        <CheckCircle className="size-4 text-mint-ink" aria-hidden />
        Done. {formatCount(result.changes)} {result.changes === 1 ? "row" : "rows"} changed in{" "}
        {formatDuration(result.durationMs)}.
      </div>
    );
  }
  return (
    <DataGrid
      label="Query results"
      columns={columns}
      rows={result.rows}
      layout={layout}
      onLayoutChange={(p) => setLayout((l) => ({ ...l, ...p }))}
      density={density}
      empty="The query returned no rows."
    />
  );
}

export default function QueryConsole({
  tabId,
  sql,
  schema,
}: {
  tabId: string;
  sql: string;
  schema: Schema | undefined;
}) {
  const dbId = useWorkspace((s) => s.dbId);
  const updateQuery = useWorkspace((s) => s.updateQuery);
  const invalidate = useInvalidate();
  const viewRef = useRef<EditorView | null>(null);
  const [results, setResults] = useState<StatementResult[]>([]);
  const [activeResult, setActiveResult] = useState(0);
  const [running, setRunning] = useState(false);
  const [explain, setExplain] = useState(false);
  const [history, setHistory] = useState<string[]>(() =>
    readJson<string[]>(STORAGE_KEYS.queryHistory, []),
  );
  const savedId = useWorkspace((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    return tab?.kind === "query" ? tab.savedId : undefined;
  });
  const savedSql = useSavedQueries((s) => s.queries.find((q) => q.id === savedId)?.sql);
  const upToDate = savedSql !== undefined && savedSql === sql;
  const savedQueries = useSavedQueryActions();

  // Ctrl/Cmd+S saves the open query instead of the browser saving the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        savedQueries.save(tabId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [savedQueries, tabId]);

  const run = async () => {
    if (!dbId || running) return;
    const view = viewRef.current;
    const selection = view?.state.selection.main;
    const text =
      selection && !selection.empty ? view!.state.sliceDoc(selection.from, selection.to) : sql;
    if (!text.trim()) return;
    setRunning(true);
    try {
      const api = getSqlite();
      const out = explain
        ? await api.explainScript(dbId, text)
        : await api.execScript(dbId, text, QUERY_RESULT_ROW_LIMIT);
      setResults(out);
      const lastWithRows = out.findLastIndex((r) => r.columns.length > 0 || r.error);
      setActiveResult(lastWithRows >= 0 ? lastWithRows : out.length - 1);
      const next = [text.trim(), ...history.filter((h) => h !== text.trim())].slice(
        0,
        QUERY_HISTORY_LIMIT,
      );
      setHistory(next);
      writeJson(STORAGE_KEYS.queryHistory, next);
      if (!explain) await invalidate({ schema: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  const extensions = useMemo(() => {
    const completion: Record<string, string[]> = {};
    for (const rel of relations(schema)) {
      completion[rel.name] = rel.columns.map((c) => c.name);
    }
    return [
      sqlLanguage({ dialect: SQLite, schema: completion, upperCaseKeywords: true }),
      ...pastelEditorTheme,
    ];
  }, [schema]);

  const result = results[activeResult];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b-2 border-hairline bg-surface px-2 py-1.5">
        <Button onClick={() => void run()} disabled={running || !sql.trim()}>
          <Play /> Run
          <Kbd className="ml-1 bg-transparent text-current max-sm:hidden">Ctrl ↵</Kbd>
        </Button>
        <Toggle
          size="sm"
          pressed={explain}
          onPressedChange={setExplain}
          aria-label="Explain query plan instead of running"
        >
          <Lightbulb /> <span className="max-sm:sr-only">Explain</span>
        </Toggle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" disabled={history.length === 0}>
              <History /> <span className="max-sm:sr-only">History</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-96 w-[min(28rem,90vw)]">
            <DropdownMenuLabel className="q-label text-ink-muted">Recent queries</DropdownMenuLabel>
            {history.map((h) => (
              <DropdownMenuItem
                key={h}
                onSelect={() => updateQuery(tabId, h)}
                className="font-mono text-xs"
              >
                <span className="truncate">{h.replace(/\s+/g, " ")}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setHistory([]);
                writeJson(STORAGE_KEYS.queryHistory, []);
              }}
            >
              <Trash /> Clear history
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          disabled={!sql.trim() || upToDate}
          onClick={() => savedQueries.save(tabId)}
          aria-label={upToDate ? "Saved" : "Save query"}
        >
          {upToDate ? <Check /> : <Save />}
          <span className="max-sm:sr-only">{upToDate ? "Saved" : "Save"}</span>
          {!upToDate && (
            <Kbd className="ml-1 bg-transparent text-current max-lg:hidden">Ctrl S</Kbd>
          )}
        </Button>
        {result && result.columns.length > 0 && !result.error && (
          <div className="ml-auto">
            <ExportMenu
              name="query_result"
              sources={[
                {
                  label: `${formatCount(result.rows.length)} result rows`,
                  load: async () => result,
                },
              ]}
            />
          </div>
        )}
      </div>

      <div
        className="h-[38%] min-h-32 shrink-0 resize-y overflow-hidden border-b-2 border-hairline"
        onKeyDownCapture={(e) => {
          // Ctrl/Cmd+Enter runs; stopped here so CodeMirror doesn't insert a line.
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            void run();
          }
        }}
      >
        <CodeMirror
          value={sql}
          onChange={(value) => updateQuery(tabId, value)}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          extensions={extensions}
          theme="none"
          height="100%"
          placeholder="SELECT * FROM … — Ctrl+Enter runs the query or the selected text"
          basicSetup={{ highlightActiveLine: true, foldGutter: false, autocompletion: true }}
          className="h-full"
          aria-label="SQL editor"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        {running ? (
          <Loader className="m-auto" size="sm" label={explain ? "Explaining" : "Running"} />
        ) : results.length === 0 ? (
          <p className="m-auto max-w-sm p-6 text-center text-sm text-ink-muted">
            Results show up here. Several statements run one after another; each gets its own
            result.
          </p>
        ) : (
          <>
            {results.length > 1 && (
              <div
                role="tablist"
                aria-label="Statement results"
                className="flex gap-1 overflow-x-auto border-b border-hairline bg-surface px-2 py-1"
              >
                {results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === activeResult}
                    onClick={() => setActiveResult(i)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-xs px-2 py-1 font-mono text-xs",
                      i === activeResult ? "bg-raised text-ink" : "text-ink-muted hover:bg-active",
                    )}
                  >
                    {r.error ? (
                      <AlertCircle className="size-3 text-rose-ink" aria-label="failed" />
                    ) : (
                      <CheckCircle className="size-3 text-mint-ink" aria-label="ok" />
                    )}
                    <span className="max-w-48 truncate">{r.sql.replace(/\s+/g, " ")}</span>
                  </button>
                ))}
              </div>
            )}
            {result && <ResultView key={`${activeResult}-${result.sql}`} result={result} />}
            {result && (
              <p
                className="q-num border-t-2 border-hairline bg-surface px-3 py-1.5 text-xs text-ink-muted"
                aria-live="polite"
              >
                {result.error
                  ? "Stopped at this statement; earlier statements were applied."
                  : `${formatCount(result.rows.length)} rows${result.truncated ? ` (first ${formatCount(QUERY_RESULT_ROW_LIMIT)})` : ""} · ${formatDuration(result.durationMs)}`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
