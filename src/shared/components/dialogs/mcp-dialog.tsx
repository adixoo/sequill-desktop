import { useState } from "react";
import { CodeBlock } from "@/shared/components/pastel/code-block";
import { useMcpStatus, useSetMcpEnabled } from "@/shared/hooks/use-mcp";
import { claudeCodeCommand, mcpConfig, type McpCommand } from "@/shared/lib/mcp";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import { Button } from "@/shared/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/shared/ui/responsive-dialog";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Check } from "./column-fields";
import { CopyButton } from "./simple-dialogs";

/** Numbered setup steps, then the text to copy. */
function Setup({ steps, fileName, code }: { steps: string[]; fileName: string; code: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink-soft">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <CodeBlock fileName={fileName} code={code} className="min-w-0" />
      <div>
        <CopyButton text={code} copied="Copied" />
      </div>
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
      <Tabs defaultValue="desktop" className="min-w-0">
        <TabsList>
          <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
          <TabsTrigger value="code">Claude Code</TabsTrigger>
          <TabsTrigger value="other">Other clients</TabsTrigger>
        </TabsList>
        <TabsContent value="desktop" className="min-w-0 pt-3">
          <Setup
            steps={[
              "In Claude Desktop, open Settings, then Developer, then Edit Config.",
              "Add this to claude_desktop_config.json (merge it into mcpServers if the file has one).",
              "Save the file and restart Claude Desktop.",
            ]}
            fileName="claude_desktop_config.json"
            code={mcpConfig(command, allowWrites)}
          />
        </TabsContent>
        <TabsContent value="code" className="min-w-0 pt-3">
          <Setup
            steps={["Run this in a terminal.", "Start a new Claude Code session to use it."]}
            fileName="terminal"
            code={claudeCodeCommand(command, allowWrites)}
          />
        </TabsContent>
        <TabsContent value="other" className="min-w-0 pt-3">
          <Setup
            steps={[
              "Add a stdio MCP server to your client with this command and arguments.",
              "Restart the client.",
            ]}
            fileName="mcp settings"
            code={mcpConfig(command, allowWrites)}
          />
        </TabsContent>
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

        <div className="flex items-center justify-between gap-4 rounded-md bg-raised p-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="mcp-enabled" className="text-sm font-semibold text-ink">
              {enabled ? "On: assistants can use your databases" : "Off: assistants are refused"}
            </Label>
            <p className="text-xs text-ink-muted">Takes effect at once, even mid-conversation.</p>
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
