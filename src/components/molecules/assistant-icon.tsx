import type { ComponentType } from "react";
import {
  siClaude,
  siCursor,
  siGooglegemini,
  siJetbrains,
  siWindsurf,
  siZedindustries,
  type SimpleIcon,
} from "simple-icons";
import { ChatGpt, Sparkles, VsCode } from "@/components/atoms/icons";
import type { IconProps } from "@/types/components/atoms/icons";
import { cn } from "@/utils";

// VS Code and OpenAI have no mark in simple-icons, so those two come from the app's icon set.
const MARKS: Record<string, SimpleIcon | ComponentType<IconProps>> = {
  "claude-desktop": siClaude,
  "claude-code": siClaude,
  cursor: siCursor,
  vscode: VsCode,
  codex: ChatGpt,
  gemini: siGooglegemini,
  windsurf: siWindsurf,
  zed: siZedindustries,
  jetbrains: siJetbrains,
};

/** An MCP client's logo in the text colour, by its `MCP_CLIENTS` id; a sparkle for others. */
export function AssistantIcon({ client, className }: { client: string; className?: string }) {
  const mark = MARKS[client] ?? Sparkles;
  if (typeof mark === "function") {
    const Icon = mark;
    return <Icon className={cn("size-5", className)} />;
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5 fill-current", className)}>
      <path d={mark.path} />
    </svg>
  );
}
