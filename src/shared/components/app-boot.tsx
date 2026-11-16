import { RotateCcw } from "@/shared/ui/icons";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Loader, type LoaderStage } from "@/shared/components/pastel/loader";
import { Button } from "@/shared/ui/button";
import { isDesktop } from "@/shared/lib/platform";
import { bootSqlite } from "@/shared/lib/sqlite/client";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import type { BootStage } from "@/shared/lib/sqlite/types";

const STAGES: { stage: BootStage; label: string }[] = [
  { stage: "engine", label: "Loading SQLite engine" },
  { stage: "storage", label: "Opening browser storage" },
];
const ORDER: BootStage[] = ["engine", "storage", "ready"];

function stageState(current: BootStage | null, stage: BootStage): LoaderStage["state"] {
  if (current === null) return stage === "engine" ? "active" : "pending";
  const [a, b] = [ORDER.indexOf(current), ORDER.indexOf(stage)];
  return a > b ? "done" : a === b ? "active" : "pending";
}

interface AppBootProps {
  /** Downloads the page's UI chunk; runs in parallel with booting SQLite. Must be stable. */
  load(): Promise<ComponentType>;
  /** What is starting, e.g. "the editor". */
  name: string;
}

/**
 * Boots SQLite (worker + wasm + OPFS) and downloads a page's UI in parallel,
 * showing each stage. The UI chunk never blocks the first paint.
 */
export function AppBoot({ load, name }: AppBootProps) {
  const [stage, setStage] = useState<BootStage | null>(null);
  const [Shell, setShell] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(() => {
    // The desktop app keeps databases on disk, so only browsers need OPFS.
    if (!isDesktop() && typeof navigator !== "undefined" && !navigator.storage?.getDirectory) {
      Promise.resolve().then(() =>
        setError(
          "This browser can't store databases (no Origin Private File System). Try a current Chrome, Edge, Firefox or Safari, outside private browsing.",
        ),
      );
      return;
    }
    const engine = bootSqlite((p) => setStage(p.stage));
    Promise.all([engine, load()]).then(
      ([, shell]) => {
        setShell(() => shell);
        void navigator.storage.persist?.().catch(() => false);
      },
      (e) => setError(errorMessage(e)),
    );
  }, [load]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  if (Shell && stage === "ready") return <Shell />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      {error ? (
        <div role="alert" className="flex max-w-md flex-col items-start gap-4">
          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink">
            {name.charAt(0).toUpperCase() + name.slice(1)} could not load
          </h1>
          <p className="text-sm leading-relaxed text-ink-soft">{error}</p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setError(null);
                setStage(null);
                start();
              }}
            >
              <RotateCcw /> Try again
            </Button>
          </div>
        </div>
      ) : (
        <Loader
          label={`Starting ${name}`}
          stages={[
            ...STAGES.map((s) => ({ label: s.label, state: stageState(stage, s.stage) })),
            {
              label: "Loading the interface",
              state: Shell ? "done" : stage === "ready" ? "active" : "pending",
            },
          ]}
        />
      )}
    </div>
  );
}
