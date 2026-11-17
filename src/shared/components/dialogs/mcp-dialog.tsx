import { useState, type ReactNode } from "react";
import { CodeBlock } from "@/shared/components/pastel/code-block";
import { useMcpStatus, useSetMcpAllowChanges, useSetMcpEnabled } from "@/shared/hooks/use-mcp";
import { MCP_CLIENTS, type McpClient, type McpStatus } from "@/shared/lib/mcp";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import { useDialogs } from "@/shared/lib/store/dialogs";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { History, TriangleAlert } from "@/shared/ui/icons";
import { Label } from "@/shared/ui/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/shared/ui/responsive-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";

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

/** A number in a circle, for steps. */
function StepNumber({ n, size = "sm" }: { n: number; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-sky-wash font-mono font-medium text-sky-ink",
        size === "md" ? "size-6 text-xs" : "mt-0.5 size-5 text-[0.6875rem]",
      )}
    >
      {n}
    </span>
  );
}

/** One of the guide's three steps. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`mcp-step-${n}`} className="flex min-w-0 flex-col gap-3">
      <h3 id={`mcp-step-${n}`} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <StepNumber n={n} size="md" />
        {title}
      </h3>
      <div className="flex min-w-0 flex-col gap-3 sm:pl-8.5">{children}</div>
    </section>
  );
}

/** A setting with a plain explanation of what it does right now. */
function SwitchRow({
  id,
  title,
  detail,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-semibold text-ink">
          {title}
        </Label>
        <p id={`${id}-detail`} className="text-xs leading-relaxed text-ink-muted">
          {detail}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-detail`}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );
}

/** Step 1: the two switches the server checks on every call. */
function Permissions({ status }: { status: McpStatus }) {
  const setEnabled = useSetMcpEnabled();
  const setAllowChanges = useSetMcpAllowChanges();
  const busy = setEnabled.isPending || setAllowChanges.isPending;
  return (
    <>
      <div className="divide-y-2 divide-hairline rounded-md ring-2 ring-hairline ring-inset">
        <SwitchRow
          id="mcp-enabled"
          title="Let assistants use Sequill"
          detail={
            status.enabled
              ? "On: they can see your databases, read rows and open tables or queries in this window."
              : "Off: every request from an assistant is refused, even if it's set up."
          }
          checked={status.enabled}
          disabled={busy}
          onChange={(on) => setEnabled.mutate(on)}
        />
        <SwitchRow
          id="mcp-allow-changes"
          title="Allow changes"
          detail={
            status.allowChanges
              ? "On: they can also add, edit and delete rows, tables and databases."
              : "Off: they can only read. Turn it on when you want an assistant to edit for you."
          }
          checked={status.allowChanges}
          disabled={busy || !status.enabled}
          onChange={(on) => setAllowChanges.mutate(on)}
        />
      </div>
      {status.enabled && status.allowChanges && (
        <p className="flex items-start gap-2 rounded-md bg-rose-wash px-3 py-2 text-xs leading-relaxed text-rose-ink">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          Changes are saved straight to your database files. Keep a copy of anything you can&apos;t
          lose.
        </p>
      )}
      <p className="text-xs text-ink-muted">
        Switches work at once, even in the middle of a chat. You never need to redo step 2 after
        changing them.
      </p>
    </>
  );
}

/** Numbered instructions for one assistant, then the command or settings to copy. */
function Setup({ client, code }: { client: McpClient; code: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ol className="flex flex-col gap-2.5">
        {client.steps.map((step, i) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
            <StepNumber n={i + 1} />
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
        wrap={client.install === "command"}
        className="min-w-0"
      />
    </div>
  );
}

/** Step 2: pick an assistant, then copy its one command or its settings. */
function Installation({ status }: { status: McpStatus }) {
  const [clientId, setClientId] = useState(MCP_CLIENTS[0].id);
  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0];
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mcp-client" className="text-sm text-ink-soft">
          Which assistant do you use?
        </Label>
        <Select value={client.id} onValueChange={setClientId}>
          <SelectTrigger id="mcp-client" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MCP_CLIENTS.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.install === "command" && <span className="text-ink-muted"> · one command</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Setup client={client} code={client.config(status)} />
    </>
  );
}

/** Development builds would hand out an exe that opens a console and changes on rebuild. */
function DevBuildNote({ command }: { command: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-butter-wash px-3 py-2.5 text-xs leading-relaxed text-butter-ink">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        This is a development build. Assistants set up from here start{" "}
        <code className="font-mono break-all">{command}</code>, which opens a console window and
        stops working when you rebuild. Set them up from the installed Sequill instead.
      </span>
    </p>
  );
}

/** Explains MCP, holds its two switches and shows how to connect an assistant. Desktop only. */
export function McpDialog({ onClose }: { onClose(): void }) {
  const status = useMcpStatus();
  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect an AI assistant</DialogTitle>
          <DialogDescription>
            AI assistants such as Claude, Cursor or GitHub Copilot can work with your Sequill
            databases through MCP. Set it up once, then just ask, for example &ldquo;Which customers
            ordered last week?&rdquo; What they change shows up here on its own.
          </DialogDescription>
        </DialogHeader>

        {status.error ? (
          <p role="alert" className="text-sm text-negative">
            {errorMessage(status.error)}
          </p>
        ) : (
          status.data && (
            <div className="flex min-w-0 flex-col gap-6">
              {status.data.devBuild && <DevBuildNote command={status.data.command} />}
              <Step n={1} title="Choose what assistants may do">
                <Permissions status={status.data} />
              </Step>
              <Step n={2} title="Add Sequill to your assistant">
                <Installation status={status.data} />
              </Step>
              <Step n={3} title="Try it">
                <p className="text-sm leading-relaxed text-ink-soft">
                  Start a new chat and ask:{" "}
                  <strong className="text-ink">List my Sequill databases.</strong> It should name
                  the databases you see here. If it doesn&apos;t know Sequill, check step 1 and
                  restart the assistant. Keep Sequill open while it works: assistants reach your
                  databases through this window.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  Everything they do is listed under History, next to MCP in the top bar.
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => useDialogs.getState().open({ kind: "mcpActivity" })}
                  >
                    <History /> Open history
                  </Button>
                </div>
                <p className="text-xs text-ink-muted">
                  The setup points at this copy of Sequill. If you move or reinstall it, do step 2
                  again.
                </p>
              </Step>
            </div>
          )
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
