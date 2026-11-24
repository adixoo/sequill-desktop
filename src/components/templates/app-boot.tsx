import { RotateCcw } from "@/components/atoms/icons";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Loader } from "@/components/molecules/pastel/loader";
import { Button } from "@/components/atoms/button";
import { bootSqlite } from "@/lib/sqlite/client";
import { errorMessage } from "@/lib/sqlite/errors";
import type { BootStage } from "@/types/lib/sqlite/types";

interface AppBootProps {
  /** Downloads the page's UI chunk; runs in parallel with booting SQLite. Must be stable. */
  load(): Promise<ComponentType>;
  /** What is starting, e.g. "the editor". */
  name: string;
}

/**
 * Starts the desktop app's SQLite and downloads a page's UI in parallel,
 * showing each stage. The UI chunk never blocks the first paint.
 */
export function AppBoot({ load, name }: AppBootProps) {
  const [stage, setStage] = useState<BootStage | null>(null);
  const [Shell, setShell] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(() => {
    const engine = bootSqlite((p) => setStage(p.stage));
    Promise.all([engine, load()]).then(
      ([, shell]) => setShell(() => shell),
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
    <div
      data-density="comfortable"
      className="flex min-h-dvh items-center justify-center bg-canvas p-6"
    >
      {error ? (
        <div role="alert" className="flex max-w-md flex-col items-start gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
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
            { label: "Starting SQLite", state: stage === "ready" ? "done" : "active" },
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
