/** React Query bindings for the MCP switches and history (desktop app only). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/atoms/toast";
import { queryKeys } from "@/hooks/use-db";
import type { McpStatus } from "@/types/lib/mcp";
import { isDesktop } from "@/lib/platform";
import {
  clearMcpActivity,
  installMcp,
  mcpActivity,
  mcpStatus,
  setMcpAllowChanges,
  setMcpEnabled,
  setMcpHistoryDays,
} from "@/lib/sqlite/desktop";
import { errorMessage } from "@/lib/sqlite/errors";

/** How many calls the history shows at most. */
const MCP_ACTIVITY_LIMIT = 500;

/** Whether MCP access is on, and how clients start the server. Never loads in browsers. */
export function useMcpStatus() {
  return useQuery({ queryKey: queryKeys.mcp, queryFn: mcpStatus, enabled: isDesktop() });
}

/** Changes one MCP setting, then shows the new status and says what it means. */
function useMcpSetting<T>(
  change: (value: T) => Promise<McpStatus>,
  said: (s: McpStatus) => string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: async (status) => {
      client.setQueryData(queryKeys.mcp, status);
      await client.invalidateQueries({ queryKey: queryKeys.mcpActivity });
      toast.success(said(status));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useSetMcpEnabled() {
  return useMcpSetting(setMcpEnabled, (s) =>
    s.enabled ? "Assistants can now use Sequill" : "Assistants can no longer use Sequill",
  );
}

export function useSetMcpAllowChanges() {
  return useMcpSetting(setMcpAllowChanges, (s) =>
    s.allowChanges ? "Assistants can now make changes" : "Assistants can now only read",
  );
}

export function useSetMcpHistoryDays() {
  return useMcpSetting(setMcpHistoryDays, (s) =>
    s.historyDays === null
      ? "Assistant history is kept until you clear it"
      : `Assistant history is kept for ${s.historyDays} ${s.historyDays === 1 ? "day" : "days"}`,
  );
}

/** What assistants did over MCP, newest first. Refreshed when the server records a call. */
export function useMcpActivity() {
  return useQuery({
    queryKey: queryKeys.mcpActivity,
    queryFn: () => mcpActivity(MCP_ACTIVITY_LIMIT),
    enabled: isDesktop(),
  });
}

export function useClearMcpActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: clearMcpActivity,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.mcpActivity });
      toast.success("Assistant history cleared");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Adds Sequill to one assistant; the dialog shows the outcome next to the button. */
export function useInstallMcp() {
  return useMutation({ mutationFn: installMcp });
}
