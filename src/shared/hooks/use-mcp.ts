/** React Query bindings for the MCP switches (desktop app only). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/shared/hooks/use-db";
import type { McpStatus } from "@/shared/lib/mcp";
import { isDesktop } from "@/shared/lib/platform";
import { mcpStatus, setMcpAllowChanges, setMcpEnabled } from "@/shared/lib/sqlite/desktop";
import { errorMessage } from "@/shared/lib/sqlite/errors";

/** Whether MCP access is on, and how clients start the server. Never loads in browsers. */
export function useMcpStatus() {
  return useQuery({ queryKey: queryKeys.mcp, queryFn: mcpStatus, enabled: isDesktop() });
}

/** Flips one switch, then shows the new status and says what it means. */
function useMcpSwitch(flip: (on: boolean) => Promise<McpStatus>, said: (s: McpStatus) => string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: flip,
    onSuccess: (status) => {
      client.setQueryData(queryKeys.mcp, status);
      toast.success(said(status));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useSetMcpEnabled() {
  return useMcpSwitch(setMcpEnabled, (s) =>
    s.enabled ? "Assistants can now use Sequill" : "Assistants can no longer use Sequill",
  );
}

export function useSetMcpAllowChanges() {
  return useMcpSwitch(setMcpAllowChanges, (s) =>
    s.allowChanges ? "Assistants can now make changes" : "Assistants can now only read",
  );
}
