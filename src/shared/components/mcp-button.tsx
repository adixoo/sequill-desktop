import { useMcpStatus } from "@/shared/hooks/use-mcp";
import { isDesktop } from "@/shared/lib/platform";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/** Shows what AI assistants may do with the databases and opens the MCP guide. Desktop only. */
export function McpButton({ className }: { className?: string }) {
  const status = useMcpStatus();
  const openDialog = useDialogs((s) => s.open);
  if (!isDesktop()) return null;
  const on = status.data?.enabled ?? false;
  const state = !on ? "off" : status.data?.allowChanges ? "on" : "read only";
  const meaning = !on
    ? "assistants can't use Sequill"
    : status.data?.allowChanges
      ? "assistants can read and make changes"
      : "assistants can only read";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("gap-2", className)}
      aria-label={`MCP: ${meaning}. Open the AI assistant settings`}
      title={`MCP: ${meaning}`}
      onClick={() => openDialog({ kind: "mcp" })}
    >
      <span aria-hidden className={cn("size-2 rounded-full", on ? "bg-added" : "bg-ink-muted")} />
      MCP
      <span className={on ? "text-added-ink" : "text-ink-muted"}>{state}</span>
    </Button>
  );
}
