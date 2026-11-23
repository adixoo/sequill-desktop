import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/atoms/alert-dialog";
import { Button } from "@/components/atoms/button";
import { getSqlite, watchStorage } from "@/lib/sqlite/client";
import { errorMessage } from "@/lib/sqlite/errors";
import type { StorageState } from "@/lib/sqlite/types";

/**
 * Only one window can hold the database files (the installed app and a browser
 * tab of the site count as two). This window lets go of them while it's in the
 * background and takes them back when it's shown again. If another window
 * takes them while this one is on screen, it says so and offers to take them back.
 */
export function StorageHandoff() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StorageState>("active");
  const [error, setError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    const sqlite = getSqlite();
    let previous: StorageState = "active";
    void watchStorage((next) => {
      // Another window may have changed the data while this one didn't hold it.
      if (next === "active" && previous !== "active") void queryClient.invalidateQueries();
      previous = next;
      setState(next);
    });

    const release = () => void sqlite.release().catch(() => undefined);
    // A failure here leaves the window "taken", which shows the notice below.
    const acquire = () => void sqlite.acquire().catch(() => undefined);
    const onVisibility = () => (document.visibilityState === "hidden" ? release() : acquire());
    const onPageShow = (e: PageTransitionEvent) => e.persisted && acquire();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [queryClient]);

  const takeOver = async () => {
    setTaking(true);
    setError(null);
    try {
      await getSqlite().acquire();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaking(false);
    }
  };

  return (
    <AlertDialog open={state === "taken"}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Your databases are open in another window</AlertDialogTitle>
          <AlertDialogDescription>
            Only one window can use them at a time, like the installed app and a browser tab. Use
            them here and the other window will pause.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <Button onClick={() => void takeOver()} disabled={taking}>
            {taking ? "Taking them over…" : "Use here"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
