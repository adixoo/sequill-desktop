import { useState, type ReactNode } from "react";
import { CodeBlock } from "@/components/molecules/pastel/code-block";
import {
  useInstallMcp,
  useMcpStatus,
  useSetMcpAllowChanges,
  useSetMcpEnabled,
} from "@/hooks/use-mcp";
import { MCP_CLIENTS } from "@/lib/mcp";
import type { McpClient, McpOs, McpStatus } from "@/types/lib/mcp";
import { errorMessage } from "@/lib/sqlite/errors";
import { useDialogs } from "@/store/dialogs";
import { AssistantIcon } from "@/components/molecules/assistant-icon";
import { StepNumber } from "@/components/molecules/step-number";
import { Button } from "@/components/atoms/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { CheckCircle, ChevronRight, History, TriangleAlert } from "@/components/atoms/icons";
import { Label } from "@/components/atoms/label";
import { ResponsiveDialog, ResponsiveDialogContent } from "@/components/atoms/responsive-dialog";
import { Spinner } from "@/components/atoms/spinner";
import { Switch } from "@/components/atoms/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/atoms/toggle-group";

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

/** Numbered instructions for one assistant on this system, then the command or settings to copy. */
function ManualSteps({ client, code, os }: { client: McpClient; code: string; os: McpOs }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ol className="flex flex-col gap-2.5">
        {client.steps(os).map((step, i) => (
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

/** The "Add to …" button, then what happened and what to do next. */
function OneClick({ client, next }: { client: McpClient; next: string }) {
  const install = useInstallMcp();
  return (
    <div className="flex flex-col gap-3 rounded-md bg-raised p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="lg" onClick={() => install.mutate(client.id)} disabled={install.isPending}>
          {install.isPending ? (
            <Spinner />
          ) : (
            <AssistantIcon client={client.id} className="size-4" />
          )}
          Add to {client.name}
        </Button>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted">
          Sequill adds itself to {client.name}&apos;s settings in one click. Your other settings
          stay as they are.
        </p>
      </div>
      {install.isSuccess && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-mint-wash px-3 py-2.5 text-sm leading-relaxed text-mint-ink"
        >
          <CheckCircle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <strong className="font-semibold">Added.</strong> <StepText text={next} />
            <span className="mt-1 block text-xs break-all opacity-80">{install.data}</span>
          </span>
        </p>
      )}
      {install.isError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-rose-wash px-3 py-2.5 text-sm leading-relaxed text-rose-ink"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{errorMessage(install.error)}</span>
        </p>
      )}
    </div>
  );
}

/** One assistant: the button when the app can add itself, otherwise (or folded away) the steps. */
function ClientSetup({ client, status }: { client: McpClient; status: McpStatus }) {
  const steps = <ManualSteps client={client} code={client.config(status)} os={status.os} />;
  if (!client.oneClick) return steps;
  return (
    <>
      <OneClick client={client} next={client.oneClick} />
      <details className="group rounded-md ring-2 ring-hairline ring-inset">
        <summary className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-ink-soft outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
          Or set it up by hand
        </summary>
        <div className="px-3 pt-1 pb-3">{steps}</div>
      </details>
    </>
  );
}

/** Step 2: pick an assistant, then add Sequill in one click or by hand. */
function Installation({ status }: { status: McpStatus }) {
  const [clientId, setClientId] = useState(MCP_CLIENTS[0].id);
  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0];
  return (
    <>
      <div className="flex flex-col gap-2">
        <p id="mcp-client-label" className="text-sm text-ink-soft">
          Which assistant do you use?
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          value={client.id}
          // Radix clears the value when the chosen tile is clicked again; keep it chosen.
          onValueChange={(id) => id && setClientId(id)}
          aria-labelledby="mcp-client-label"
          className="grid w-full grid-cols-2 sm:grid-cols-5"
        >
          {MCP_CLIENTS.map((c) => (
            <ToggleGroupItem
              key={c.id}
              value={c.id}
              className="h-auto min-w-0 flex-col gap-1.5 px-2 py-3 whitespace-normal data-[state=on]:border-sky-ink/50 data-[state=on]:bg-sky-wash data-[state=on]:text-sky-ink"
            >
              <AssistantIcon client={c.id} className="size-6" />
              <span className="text-center text-sm leading-tight font-medium">{c.name}</span>
              <span className="text-xs font-normal text-ink-muted">{c.kind}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <ClientSetup key={client.id} client={client} status={status} />
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
      <ResponsiveDialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
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
                  restart the assistant. Assistants keep working when Sequill is closed, except
                  Claude Desktop from the Microsoft Store, which needs Sequill open.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  Everything they do is listed under History, next to MCP in the top bar.
                  <Button
                    variant="outline"
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
