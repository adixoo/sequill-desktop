import { useState } from "react";
import { CodeBlock } from "@/components/molecules/pastel/code-block";
import { useNow } from "@/hooks/use-now";
import {
  useClearMcpActivity,
  useMcpActivity,
  useMcpStatus,
  useSetMcpHistoryDays,
} from "@/hooks/use-mcp";
import {
  activityDetails,
  activityLabel,
  dayLabel,
  describeTool,
  MCP_HISTORY_CHOICES,
  timeAgo,
  type McpActivity,
} from "@/lib/mcp";
import { navigate, ROUTES } from "@/lib/router";
import { errorMessage } from "@/lib/sqlite/errors";
import { useWorkspace } from "@/store/workspace";
import { cn } from "@/utils";
import { Button } from "@/components/atoms/button";
import { History, SquareTerminal, Table, Trash } from "@/components/atoms/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/atoms/sheet";

/** Select values for the history setting: a number of days, or "forever". */
const FOREVER = "forever";
const toChoice = (days: number | null) => (days === null ? FOREVER : String(days));
const fromChoice = (value: string) => (value === FOREVER ? null : Number(value));

/** Arguments already shown elsewhere in a row (the table, the view of show_in_app). */
const SHOWN_ARGUMENTS = new Set(["table", "view"]);

/** A green dot for a call that worked, a rose one for one that failed or was refused. */
function ActivityDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", ok ? "bg-added" : "bg-rose-ink")}
    />
  );
}

/** Opens what a call was about in the editor, on its database. */
function useOpenActivity(onDone: () => void) {
  const go = (activity: McpActivity, open: () => void) => {
    if (activity.databaseId) useWorkspace.getState().setDb(activity.databaseId);
    navigate(ROUTES.editor);
    open();
    onDone();
  };
  return {
    query: (a: McpActivity) => go(a, () => useWorkspace.getState().showAssistantQuery(a.sql ?? "")),
    table: (a: McpActivity, table: string) => go(a, () => useWorkspace.getState().openTable(table)),
  };
}

function ActivityRow({
  activity,
  now,
  onOpenQuery,
  onOpenTable,
}: {
  activity: McpActivity;
  now: number;
  onOpenQuery(): void;
  onOpenTable(table: string): void;
}) {
  const { changes } = describeTool(activity.tool);
  const details = activityDetails(activity);
  const table = typeof details.table === "string" ? details.table : null;
  const other = Object.keys(details).filter((k) => !SHOWN_ARGUMENTS.has(k));
  const canOpen = activity.databaseId !== null;
  const where = [activity.databaseName, table].filter(Boolean).join(" · ");
  return (
    <li className="flex min-w-0 flex-col gap-1.5 py-2.5">
      <div className="flex min-h-7 items-center gap-2">
        <ActivityDot ok={activity.ok} />
        <span className="shrink-0 text-sm font-medium text-ink">{activityLabel(activity)}</span>
        {changes && (
          <span className="shrink-0 rounded-xs bg-peach-wash px-1 text-[0.625rem] font-medium text-peach-ink uppercase">
            edit
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{where}</span>
        {canOpen && activity.sql && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Open in the Assistant tab"
            title="Open in the Assistant tab"
            onClick={onOpenQuery}
          >
            <SquareTerminal />
          </Button>
        )}
        {canOpen && table && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Show ${table}`}
            title={`Show ${table}`}
            onClick={() => onOpenTable(table)}
          >
            <Table />
          </Button>
        )}
        <time
          dateTime={new Date(activity.at).toISOString()}
          title={new Date(activity.at).toLocaleString()}
          className="w-12 shrink-0 text-right font-mono text-[0.6875rem] whitespace-nowrap text-ink-muted"
        >
          {timeAgo(activity.at, now)}
        </time>
      </div>
      {!activity.ok && activity.message && (
        <p className="pl-4 text-xs text-rose-ink">{activity.message}</p>
      )}
      {activity.sql && (
        <CodeBlock
          fileName="SQL"
          code={activity.sql}
          copyable
          wrap
          bare
          className="ml-4 max-h-40 min-w-0 overflow-y-auto"
        />
      )}
      {other.length > 0 && (
        <details className="pl-4 text-xs text-ink-muted">
          <summary className="cursor-pointer select-none hover:text-ink-soft">Arguments</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-sm bg-raised p-2 font-mono text-[0.6875rem] wrap-anywhere whitespace-pre-wrap text-ink-soft">
            {JSON.stringify(Object.fromEntries(other.map((k) => [k, details[k]])), null, 2)}
          </pre>
        </details>
      )}
    </li>
  );
}

/** Calls grouped under "Today", "Yesterday" and older dates, newest first. */
function byDay(activity: McpActivity[], now: number): [string, McpActivity[]][] {
  const groups = new Map<string, McpActivity[]>();
  for (const a of activity) {
    const day = dayLabel(a.at, now);
    groups.set(day, [...(groups.get(day) ?? []), a]);
  }
  return [...groups];
}

/** How long the history is kept, and a way to clear it, on one line. */
function HistorySettings({ count }: { count: number }) {
  const status = useMcpStatus();
  const setDays = useSetMcpHistoryDays();
  const clear = useClearMcpActivity();
  const [confirming, setConfirming] = useState(false);
  const days = status.data?.historyDays;
  return (
    <div className="flex items-center justify-between gap-3">
      <Select
        value={days === undefined ? undefined : toChoice(days)}
        disabled={!status.data || setDays.isPending}
        onValueChange={(v) => setDays.mutate(fromChoice(v))}
      >
        <SelectTrigger size="sm" aria-label="Keep history for" className="w-32">
          <span className="text-ink-muted">Keep</span>
          <SelectValue placeholder="…" />
        </SelectTrigger>
        <SelectContent>
          {MCP_HISTORY_CHOICES.map((c) => (
            <SelectItem key={toChoice(c.days)} value={toChoice(c.days)}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {confirming ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-soft">Clear all?</span>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={clear.isPending}
            onClick={() => clear.mutate(undefined, { onSettled: () => setConfirming(false) })}
          >
            Clear
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-ink"
          disabled={count === 0}
          onClick={() => setConfirming(true)}
        >
          <Trash /> Clear
        </Button>
      )}
    </div>
  );
}

/** Everything assistants did over MCP, newest first, with links back to it. Desktop only. */
export function McpActivitySheet({ onClose }: { onClose(): void }) {
  const activity = useMcpActivity();
  const open = useOpenActivity(onClose);
  const now = useNow();
  const entries = activity.data ?? [];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 bg-surface data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="gap-1 border-b-2 border-hairline">
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4 text-ink-muted" /> Assistant activity
          </SheetTitle>
          <SheetDescription>What assistants did over MCP. Kept on this computer.</SheetDescription>
          <div className="pt-2">
            <HistorySettings count={entries.length} />
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {activity.error ? (
            <p role="alert" className="pt-4 text-sm text-negative">
              {errorMessage(activity.error)}
            </p>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">
              {activity.isLoading ? "Loading…" : "Nothing yet."}
            </p>
          ) : (
            byDay(entries, now).map(([day, calls]) => (
              <section key={day} aria-label={day}>
                <h3 className="pn-eyebrow sticky top-0 z-10 bg-surface pt-4 pb-1 text-ink-muted">
                  {day}
                </h3>
                <ol className="flex flex-col divide-y-2 divide-hairline">
                  {calls.map((a) => (
                    <ActivityRow
                      key={a.id}
                      activity={a}
                      now={now}
                      onOpenQuery={() => open.query(a)}
                      onOpenTable={(table) => open.table(a, table)}
                    />
                  ))}
                </ol>
              </section>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
