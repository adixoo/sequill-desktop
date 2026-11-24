import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ExternalChanges } from "./external-changes";
import { Toaster } from "@/components/atoms/toast";
import { TooltipProvider } from "@/components/atoms/tooltip";

/** Providers for pages that talk to SQLite (editor, visualizer). */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        {children}
        <ExternalChanges />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
