import { useState } from "react";
import { CodeBlock } from "@/shared/components/pastel/code-block";
import { useMcpStatus, useSetMcpEnabled } from "@/shared/hooks/use-mcp";
import { MCP_CLIENTS, type McpClient, type McpCommand } from "@/shared/lib/mcp";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { TriangleAlert } from "@/shared/ui/icons";
import { Label } from "@/shared/ui/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/shared/ui/responsive-dialog";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Check } from "./column-fields";

/** A step's text with `code` and **bold** spans. */
function StepText({ text }: { text: string }) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-xs bg-raised px-1 py-0.5 font-mono text-[0.8125em] break-all text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/** Numbered setup steps, then the code to copy. */
function Setup({ client, code }: { client: McpClient; code: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ol className="flex flex-col gap-2.5">
        {client.steps.map((step, i) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-wash font-mono text-[0.6875rem] font-medium text-sky-ink"
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <StepText text={step} />
            </span>
          </li>
        ))}
      </ol>
      <CodeBlock
        fileName={client.fileName}
        code={code}
        language={client.language}
        copyable
        className="min-w-0"
      />
    </div>
  );
}

function Installation({ command }: { command: McpCommand }) {
  const [allowWrites, setAllowWrites] = useState(false);
  return (
    <section aria-labelledby="mcp-setup" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="mcp-setup" className="text-sm font-semibold text-ink">
          Connect an assistant
        </h3>
        <Check label="Also let it make changes" checked={allowWrites} onChange={setAllowWrites} />
      </div>
      {allowWrites && (
        <p className="flex items-start gap-2 rounded-md bg-rose-wash px-3 py-2 text-xs text-rose-ink">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          The assistant can add, change and delete rows, tables and databases. Keep a copy of
          anything you can&apos;t lose.
        </p>
      )}
      <Tabs defaultValue={MCP_CLIENTS[0].id} className="min-w-0 gap-4">
        <TabsList
          aria-label="Assistant"
          className="grid h-auto w-full grid-cols-2 gap-1.5 bg-transparent p-0 group-data-horizontal/tabs:h-auto sm:grid-cols-5"
        >
          {MCP_CLIENTS.map((client) => (
            <TabsTrigger
              key={client.id}
              value={client.id}
              className={cn(
                "h-auto flex-col items-start gap-0 rounded-md px-2.5 py-1.5 text-left",
                "text-ink-soft ring-2 ring-hairline ring-inset hover:text-ink",
                "data-active:bg-sky-wash data-active:text-ink data-active:shadow-none data-active:ring-sky-ink/40",
                "dark:data-active:border-transparent dark:data-active:bg-sky-wash dark:data-active:text-ink",
              )}
            >
              <span className="w-full truncate text-[0.8125rem] font-medium">{client.name}</span>
              <span className="text-[0.6875rem] font-normal text-ink-muted">{client.kind}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {MCP_CLIENTS.map((client) => (
          <TabsContent key={client.id} value={client.id} className="min-w-0">
            <Setup client={client} code={client.config(command, allowWrites)} />
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-xs text-ink-muted">
        Without the box ticked the assistant can only read and show things. Settings point at this
        copy of Sequill; set it up again if you move or reinstall the app.
      </p>
    </section>
  );
}

/** Turns MCP access on or off and shows how to connect an assistant. Desktop app only. */
export function McpDialog({ onClose }: { onClose(): void }) {
  const status = useMcpStatus();
  const setEnabled = useSetMcpEnabled();
  const enabled = status.data?.enabled ?? false;

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>MCP server</DialogTitle>
          <DialogDescription>
            Let AI assistants such as Claude work with your databases the way you do here: find and
            filter rows, run and explain queries, and open tables, queries or the schema in this
            window. If you allow changes, they can also edit rows, tables, indexes, triggers, views,
            databases and saved queries. Their changes show up here on their own.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-md p-3 ring-2 ring-inset",
            enabled ? "bg-mint-wash ring-mint-ink/25" : "bg-raised ring-hairline",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                enabled ? "bg-mint-ink" : "bg-strong",
              )}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="mcp-enabled" className="text-sm font-semibold text-ink">
                {enabled ? "On: assistants can use your databases" : "Off: assistants are refused"}
              </Label>
              <p className="text-xs text-ink-muted">Takes effect at once, even mid-conversation.</p>
            </div>
          </div>
          <Switch
            id="mcp-enabled"
            checked={enabled}
            disabled={!status.data || setEnabled.isPending}
            onCheckedChange={(on) => setEnabled.mutate(on)}
          />
        </div>

        {status.error ? (
          <p role="alert" className="text-sm text-negative">
            {errorMessage(status.error)}
          </p>
        ) : (
          status.data && <Installation command={status.data} />
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
