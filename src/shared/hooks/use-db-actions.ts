import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { STORAGE_KEYS } from "@/shared/lib/constants";
import { downloadBlob, safeFileName } from "@/shared/lib/data/export";
import { isDesktop } from "@/shared/lib/platform";
import { getSqlite } from "@/shared/lib/sqlite/client";
import { openDatabaseFile } from "@/shared/lib/sqlite/desktop";
import { errorMessage } from "@/shared/lib/sqlite/errors";
import { SAMPLE_DB_NAME, SAMPLE_DB_SQL } from "@/shared/lib/sqlite/sample";
import type { DbInfo } from "@/shared/lib/sqlite/types";
import { removeKey } from "@/shared/lib/storage";
import { useWorkspace } from "@/shared/lib/store/workspace";
import { queryKeys } from "./use-db";

const DB_EXTENSION_RE = /\.(sqlite3?|db3?|s3db|sl3)$/i;

/** Database-level actions shared by the sidebar, welcome screen, drop zone and command palette. */
export function useDbActions() {
  const client = useQueryClient();
  const setDb = useWorkspace((s) => s.setDb);

  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: queryKeys.dbs }),
    [client],
  );

  const withToast = useCallback(
    async <T>(
      loading: string,
      job: () => Promise<T>,
      success: (result: T) => string,
    ): Promise<T | null> => {
      const id = toast.loading(loading);
      try {
        const result = await job();
        toast.success(success(result), { id });
        return result;
      } catch (error) {
        toast.error(errorMessage(error), { id });
        return null;
      }
    },
    [],
  );

  const activate = useCallback(
    async (info: DbInfo | null) => {
      if (!info) return;
      await refresh();
      setDb(info.id);
    },
    [refresh, setDb],
  );

  const createEmpty = useCallback(
    async (name: string) =>
      activate(
        await withToast(
          "Creating database",
          () => getSqlite().createDatabase(name.trim() || "Untitled"),
          (i) => `Created ${i.name}`,
        ),
      ),
    [activate, withToast],
  );

  const createSample = useCallback(
    async () =>
      activate(
        await withToast(
          "Building the sample database",
          () => getSqlite().createDatabase(SAMPLE_DB_NAME, SAMPLE_DB_SQL),
          () => "Sample database ready",
        ),
      ),
    [activate, withToast],
  );

  /**
   * Desktop: opens a file chosen in the system's file picker where it is, so every change
   * is saved to that file and no copy is made.
   */
  const openInPlace = useCallback(async () => {
    try {
      const info = await openDatabaseFile();
      if (!info) return; // cancelled
      toast.success(`Opened ${info.name}`, { description: `Changes save to ${info.path}` });
      await activate(info);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [activate]);

  /**
   * "Open a file": the system's file picker on desktop; in browsers, clicks `input` (a
   * hidden `DbFileInput`) because only a file input can read a file there.
   */
  const pickFile = useCallback(
    (input: HTMLInputElement | null) => {
      if (isDesktop()) void openInPlace();
      else input?.click();
    },
    [openInPlace],
  );

  const openFile = useCallback(
    async (file: File) => {
      // A dropped file has no path on desktop, and a copy would leave the real file
      // unchanged: point at the picker instead, which edits the file itself.
      if (isDesktop()) {
        toast.info(`To edit ${file.name} itself, open it with "Open a file…"`, {
          action: { label: "Open a file…", onClick: () => void openInPlace() },
        });
        return;
      }
      const info = await withToast(
        `Opening ${file.name}`,
        async () =>
          getSqlite().importDatabase(
            file.name.replace(DB_EXTENSION_RE, "") || file.name,
            new Uint8Array(await file.arrayBuffer()),
          ),
        (i) => `Opened ${i.name}`,
      );
      await activate(info);
    },
    [activate, openInPlace, withToast],
  );

  const download = useCallback(
    async (info: DbInfo) => {
      await withToast(
        "Preparing download",
        async () => {
          const bytes = await getSqlite().exportDatabase(info.id);
          downloadBlob(
            bytes as BlobPart,
            `${safeFileName(info.name)}.sqlite`,
            "application/vnd.sqlite3",
          );
        },
        () => `Downloaded ${info.name}`,
      );
    },
    [withToast],
  );

  const downloadDump = useCallback(
    async (info: DbInfo) => {
      await withToast(
        "Writing SQL dump",
        async () =>
          downloadBlob(
            await getSqlite().dump(info.id),
            `${safeFileName(info.name)}.sql`,
            "application/sql",
          ),
        () => "SQL dump downloaded",
      );
    },
    [withToast],
  );

  /** Deletes a database Sequill keeps; a file opened in place only leaves the list. */
  const remove = useCallback(
    async (info: DbInfo) => {
      const done = await withToast(
        info.path ? "Removing" : "Deleting",
        () =>
          getSqlite()
            .deleteDatabase(info.id)
            .then(() => true),
        () => (info.path ? `Removed ${info.name} from the list` : `Deleted ${info.name}`),
      );
      if (!done) return;
      // The list must be fresh before the open database is cleared: reopening the last
      // database would otherwise pick the one just removed from the old list.
      await refresh();
      if (useWorkspace.getState().dbId === info.id) setDb(null);
      client.removeQueries({ queryKey: queryKeys.data(info.id) });
      client.removeQueries({ queryKey: queryKeys.schema(info.id) });
      // Its schema page state (unsaved design, layout, colors) goes with it.
      for (const key of [STORAGE_KEYS.visDraft, STORAGE_KEYS.visLayout, STORAGE_KEYS.visColors]) {
        removeKey(key + info.id);
      }
    },
    [client, refresh, setDb, withToast],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const info = await withToast(
        "Renaming",
        () => getSqlite().renameDatabase(id, name),
        (i) => `Renamed to ${i.name}`,
      );
      if (info) await refresh();
      return info !== null;
    },
    [refresh, withToast],
  );

  return useMemo(
    () => ({
      createEmpty,
      createSample,
      pickFile,
      openFile,
      download,
      downloadDump,
      remove,
      rename,
    }),
    [createEmpty, createSample, pickFile, openFile, download, downloadDump, remove, rename],
  );
}

export function isDatabaseFile(file: File): boolean {
  return (
    DB_EXTENSION_RE.test(file.name) ||
    file.type === "application/vnd.sqlite3" ||
    file.type === "application/x-sqlite3"
  );
}

export function isDataFile(file: File): boolean {
  return /\.(csv|tsv|txt|json)$/i.test(file.name);
}
