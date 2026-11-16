import { Eye, Menu, Plus, Search, SquareTerminal, Table2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/shared/ui/button";
import { Kbd } from "@/shared/ui/kbd";
import { ScrollStrip } from "@/shared/ui/scroll-strip";
import type { Schema } from "@/shared/lib/sqlite/types";
import { useSavedQueries } from "@/shared/lib/store/saved-queries";
import { useWorkspace } from "@/shared/lib/store/workspace";
import { cn } from "@/shared/lib/utils";
import { McpButton } from "@/shared/components/mcp-button";

interface TabBarProps {
  schema: Schema | undefined;
  onOpenSidebar(): void;
  onOpenPalette(): void;
}

export function TabBar({ schema, onOpenSidebar, onOpenPalette }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, closeTab, openQuery, dbId } = useWorkspace();
  const views = new Set(schema?.views.map((v) => v.name));
  const savedQueries = useSavedQueries((s) => s.queries);
  const savedSql = new Map(savedQueries.map((q) => [q.id, q.sql]));
  const listRef = useRef<HTMLDivElement>(null);

  // The strip has no scrollbar, so bring the active tab into view whenever it changes.
  useEffect(() => {
    listRef.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  return (
    <div className="flex h-12 shrink-0 items-stretch border-b-2 border-hairline bg-raised">
      <Button
        variant="ghost"
        size="icon"
        className="m-2 md:hidden"
        aria-label="Open sidebar"
        onClick={onOpenSidebar}
      >
        <Menu />
      </Button>
      <ScrollStrip
        fade="raised"
        scrollLabel="tabs"
        scrollRef={listRef}
        role="tablist"
        aria-label="Open tabs"
        className="items-stretch"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const Icon = tab.kind === "query" ? SquareTerminal : views.has(tab.table) ? Eye : Table2;
          const title = tab.kind === "query" ? tab.title : tab.table;
          return (
            <div
              key={tab.id}
              className={cn(
                "group/tab relative flex max-w-56 shrink-0 items-center border-r border-hairline",
                active ? "bg-surface" : "hover:bg-zebra",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                className="flex h-full min-w-0 items-center gap-2 pr-8 pl-3 text-sm outline-none focus-visible:bg-zebra"
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    active
                      ? tab.kind === "query"
                        ? "text-lilac-ink"
                        : "text-sky-ink"
                      : "text-ink-muted",
                  )}
                />
                <span className={cn("truncate", active ? "font-medium text-ink" : "text-ink-soft")}>
                  {title}
                </span>
                {tab.kind === "query" && tab.savedId && savedSql.get(tab.savedId) !== tab.sql && (
                  <>
                    <span aria-hidden className="rounded-pill size-1.5 shrink-0 bg-lilac-ink" />
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                aria-label={`Close ${title}`}
                className={cn(
                  "absolute right-1.5 flex size-5 items-center justify-center rounded-xs text-ink-muted outline-none hover:bg-raised focus-visible:opacity-100",
                  active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
                )}
              >
                <X className="size-3.5" />
              </button>
              {active && (
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-ink" />
              )}
            </div>
          );
        })}
        {dbId && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="m-auto ml-1 shrink-0"
            aria-label="New query"
            onClick={() => openQuery()}
          >
            <Plus />
          </Button>
        )}
      </ScrollStrip>
      <McpButton className="my-2 ml-2" />
      <Button
        variant="ghost"
        size="sm"
        className="m-2 gap-2 text-ink-muted"
        onClick={onOpenPalette}
        aria-label="Command palette"
      >
        <Search />
        <span className="max-lg:hidden">Jump to…</span>
        <Kbd className="max-lg:hidden">Ctrl K</Kbd>
      </Button>
    </div>
  );
}
