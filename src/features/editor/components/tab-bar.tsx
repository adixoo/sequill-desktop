import { CopyPlus, Eye, Menu, Search, SquareTerminal, Table, X } from "@/components/atoms/icons";
import { useEffect, useRef } from "react";
import { Button } from "@/components/atoms/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/atoms/context-menu";
import { Kbd } from "@/components/atoms/kbd";
import { ScrollStrip } from "@/components/atoms/scroll-strip";
import type { Schema } from "@/types/lib/sqlite/types";
import { useSavedQueries } from "@/store/saved-queries";
import { useWorkspace } from "@/store/workspace";
import { FOCUS_OUTLINE, ROW_ACTION_REVEAL } from "@/constants/classes";
import { cn } from "@/utils";
import { McpButton, McpHistoryButton } from "@/components/organisms/mcp-button";
import { AppHeader } from "@/components/organisms/app-header";
import { DatabaseSwitcher } from "@/components/organisms/database-switcher";
import { hasUnsavedDesign } from "@/features/vis/lib/drafts";

/** The editor's top bar: sidebar button on phones, page switcher, database switcher, MCP, palette, settings. */
export function EditorHeader({
  dbId,
  onOpenSidebar,
  onOpenPalette,
}: {
  dbId: string | null;
  onOpenSidebar(): void;
  onOpenPalette(): void;
}) {
  return (
    <AppHeader
      page="editor"
      leading={
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open sidebar"
          onClick={onOpenSidebar}
        >
          <Menu />
        </Button>
      }
      actions={
        <>
          <McpButton />
          <McpHistoryButton />
          <Button
            variant="outline"
            className="ml-1 gap-2 text-ink-muted"
            onClick={onOpenPalette}
            aria-label="Command palette"
          >
            <Search />
            <span className="max-lg:hidden">Jump to…</span>
            <Kbd className="max-lg:hidden">Ctrl K</Kbd>
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 items-center">
        <DatabaseSwitcher dbId={dbId} hasDraft={hasUnsavedDesign} />
      </div>
    </AppHeader>
  );
}

/** The open tables and queries, above the content; hidden while nothing is open. */
export function TabBar({ schema }: { schema: Schema | undefined }) {
  const { tabs, activeTabId, setActiveTab, closeTab, closeOtherTabs, closeTabsToRight, openQuery } =
    useWorkspace();
  const views = new Set(schema?.views.map((v) => v.name));
  const savedQueries = useSavedQueries((s) => s.queries);
  const savedSql = new Map(savedQueries.map((q) => [q.id, q.sql]));
  const listRef = useRef<HTMLDivElement>(null);

  // The strip has no scrollbar, so bring the active tab into view whenever it changes.
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  if (tabs.length === 0) return null;
  return (
    <div className="flex h-10 shrink-0 border-b-2 border-hairline bg-canvas">
      <ScrollStrip
        fade="canvas"
        scrollLabel="tabs"
        scrollRef={listRef}
        role="group"
        aria-label="Open tabs"
        className="items-stretch"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId;
          const Icon = tab.kind === "query" ? SquareTerminal : views.has(tab.table) ? Eye : Table;
          const title = tab.kind === "query" ? tab.title : tab.table;
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "group/row relative flex max-w-56 shrink-0 items-center border-r border-hairline",
                    active ? "bg-raised" : "hover:bg-raised",
                  )}
                >
                  {/* Plain buttons, not ARIA tabs: the content isn't a tabpanel these could control. */}
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setActiveTab(tab.id)}
                    onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
                    className={cn(
                      "flex h-full min-w-0 items-center gap-2 pr-8 pl-3 text-sm focus-visible:bg-active",
                      FOCUS_OUTLINE,
                    )}
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
                    <span
                      className={cn("truncate", active ? "font-medium text-ink" : "text-ink-soft")}
                    >
                      {title}
                    </span>
                    {tab.kind === "query" &&
                      tab.savedId &&
                      savedSql.get(tab.savedId) !== tab.sql && (
                        <>
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full bg-lilac-ink"
                          />
                          <span className="sr-only">(unsaved changes)</span>
                        </>
                      )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => closeTab(tab.id)}
                    aria-label={`Close ${title}`}
                    className={cn(
                      "absolute right-1.5 size-5 rounded-xs text-ink-muted focus-visible:outline-hidden",
                      !active && ROW_ACTION_REVEAL,
                    )}
                  >
                    <X className="size-3.5" />
                  </Button>
                  {active && (
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-ink" />
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => closeTab(tab.id)}>
                  <X /> Close
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={tabs.length === 1}
                  onSelect={() => closeOtherTabs(tab.id)}
                >
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={index === tabs.length - 1}
                  onSelect={() => closeTabsToRight(tab.id)}
                >
                  Close tabs to the right
                </ContextMenuItem>
                {tab.kind === "query" && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => openQuery(tab.sql)}>
                      <CopyPlus /> Duplicate query
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </ScrollStrip>
    </div>
  );
}
