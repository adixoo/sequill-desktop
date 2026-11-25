import { Hint } from "@/components/atoms/tooltip";
import { useMcpStatus } from "@/hooks/use-mcp";
import { useDialogs } from "@/store/dialogs";
import { cn } from "@/utils";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { History } from "@/components/atoms/icons";

/** Badge tone per state: mint on, butter read only, rose off. */
const STATE_TONES = { on: "mint", "read only": "butter", off: "rose" } as const;

/** Shows what AI assistants may do with the databases and opens the MCP guide. */
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
    <Hint label={`MCP: ${meaning}`}>
      <Button
        variant="ghost"
        className={cn("gap-2", className)}
        aria-label={`MCP: ${meaning}. Open the AI assistant settings`}
        onClick={() => openDialog({ kind: "mcp" })}
      >
        MCP
        <Badge variant={STATE_TONES[state]}>{state}</Badge>
      </Button>
    </Hint>
  );
}

/** Opens the history of what assistants did over MCP. */
export function McpHistoryButton({ className }: { className?: string }) {
  const openDialog = useDialogs((s) => s.open);
  return (
    <Hint label="What assistants did over MCP">
      <Button
        variant="ghost"
        className={cn("gap-1.5", className)}
        aria-label="Assistant history"
        onClick={() => openDialog({ kind: "mcpActivity" })}
      >
        <History />
        <span className="max-lg:hidden">History</span>
      </Button>
    </Hint>
  );
}
