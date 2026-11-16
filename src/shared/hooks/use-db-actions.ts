import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { STORAGE_KEYS } from "@/shared/lib/constants";
import { downloadBlob, safeFileName } from "@/shared/lib/data/export";
import { getSqlite } from "@/shared/lib/sqlite/client";
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

  const openFile = useCallback(
    async (file: File) => {
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
    [activate, withToast],
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

  const remove = useCallback(
    async (info: DbInfo) => {
      const done = await withToast(
        "Deleting",
        () =>
          getSqlite()
            .deleteDatabase(info.id)
            .then(() => true),
        () => `Deleted ${info.name}`,
      );
      if (!done) return;
      if (useWorkspace.getState().dbId === info.id) setDb(null);
      client.removeQueries({ queryKey: queryKeys.data(info.id) });
      client.removeQueries({ queryKey: queryKeys.schema(info.id) });
      // Its schema page state (unsaved design, layout, colors) goes with it.
      for (const key of [STORAGE_KEYS.visDraft, STORAGE_KEYS.visLayout, STORAGE_KEYS.visColors]) {
        removeKey(key + info.id);
      }
      await refresh();
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
    () => ({ createEmpty, createSample, openFile, download, downloadDump, remove, rename }),
    [createEmpty, createSample, openFile, download, downloadDump, remove, rename],
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
