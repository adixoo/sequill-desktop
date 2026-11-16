/** React Query bindings for the MCP switch (desktop app only). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/shared/hooks/use-db";
import { isDesktop } from "@/shared/lib/platform";
import { mcpStatus, setMcpEnabled } from "@/shared/lib/sqlite/desktop";
import { errorMessage } from "@/shared/lib/sqlite/errors";

/** Whether MCP access is on, and how clients start the server. Never loads in browsers. */
export function useMcpStatus() {
  return useQuery({ queryKey: queryKeys.mcp, queryFn: mcpStatus, enabled: isDesktop() });
}

export function useSetMcpEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setMcpEnabled,
    onSuccess: (status) => {
      client.setQueryData(queryKeys.mcp, status);
      toast.success(status.enabled ? "MCP is on: assistants can use your databases" : "MCP is off");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
