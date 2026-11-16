import { useMcpStatus } from "@/shared/hooks/use-mcp";
import { isDesktop } from "@/shared/lib/platform";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/** Shows whether AI assistants can use the databases and opens the MCP settings. Desktop only. */
export function McpButton({ className }: { className?: string }) {
  const status = useMcpStatus();
  const openDialog = useDialogs((s) => s.open);
  if (!isDesktop()) return null;
  const on = status.data?.enabled ?? false;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("gap-2", className)}
      aria-label={`MCP server: ${on ? "on" : "off"}. Open MCP settings`}
      title="MCP server for AI assistants"
      onClick={() => openDialog({ kind: "mcp" })}
    >
      <span aria-hidden className={cn("size-2 rounded-full", on ? "bg-added" : "bg-ink-muted")} />
      MCP
      <span className={on ? "text-added-ink" : "text-ink-muted"}>{on ? "on" : "off"}</span>
    </Button>
  );
}
