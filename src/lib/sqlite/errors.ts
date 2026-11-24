import { REBUILD_TABLE_PREFIX } from "@/constants";

/** Readable text for an error from SQLite, the worker or anywhere else. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message
      // oo1 prefixes messages with the result-code name; keep the readable part.
      .replace(/^SQLITE_[A-Z_]+:\s*(sqlite3 result code \d+:\s*)?/, "")
      // A failed table rebuild names the temporary copy; people know the table.
      .replaceAll(REBUILD_TABLE_PREFIX, "")
  );
}
