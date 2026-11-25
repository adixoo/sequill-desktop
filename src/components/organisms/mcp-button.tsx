import { useMcpStatus } from "@/hooks/use-mcp";
import { useDialogs } from "@/store/dialogs";
import { cn } from "@/utils";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { History } from "@/components/atoms/icons";

/** Shows what AI assistants may do with the databases and opens the MCP guide. Desktop only. */
/** Badge colors per state: green on, butter read only, rose off. */
const STATE_COLORS = {
  on: "bg-added-wash text-added-ink",
  "read only": "bg-butter-wash text-butter-ink",
  off: "bg-rose-wash text-rose-ink",
} as const;

export function McpButton({ className }: { className?: string }) {
  const status = useMcpStatus();
  const openDialog = useDialogs((s) => s.open);
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
      className={cn("gap-2", className)}
      aria-label={`MCP: ${meaning}. Open the AI assistant settings`}
      title={`MCP: ${meaning}`}
      onClick={() => openDialog({ kind: "mcp" })}
    >
      MCP
      <Badge variant="outline" className={cn("border-transparent", STATE_COLORS[state])}>
        {state}
      </Badge>
    </Button>
  );
}

/** Opens the history of what assistants did over MCP. Desktop only. */
export function McpHistoryButton({ className }: { className?: string }) {
  const openDialog = useDialogs((s) => s.open);
  return (
    <Button
      variant="ghost"
      className={cn("gap-1.5", className)}
      aria-label="Assistant history"
      title="What assistants did over MCP"
      onClick={() => openDialog({ kind: "mcpActivity" })}
    >
      <History />
      <span className="max-lg:hidden">History</span>
    </Button>
  );
}
