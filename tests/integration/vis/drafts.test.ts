import { beforeAll, describe, expect, test, vi } from "vitest";
import { STORAGE_KEYS } from "@/constants";
import { EMPTY_DRAFT, type Draft } from "@/features/vis/lib/model";

// The desktop build: designs live in the catalog (faked here with the same versioning rules).
const { catalog, catalogSave, warnings } = vi.hoisted(() => {
  const catalog = new Map<string, { draft: unknown; version: number }>();
  const catalogSave = (key: string, draft: unknown, version: number): number | null => {
    if ((catalog.get(key)?.version ?? 0) !== version) return null;
    catalog.set(key, { draft, version: version + 1 });
    return version + 1;
  };
  return { catalog, catalogSave, warnings: [] as string[] };
});
vi.mock("@/lib/platform", () => ({ isDesktop: () => true }));
vi.mock("@/components/atoms/toast", () => ({
  toast: { warning: (m: string) => warnings.push(m), error: (m: string) => warnings.push(m) },
}));
vi.mock("@/lib/sqlite/desktop", () => ({
  desktopDesigns: {
    list: async () => [...catalog].map(([key, d]) => ({ key, ...d })),
    save: async (key: string, draft: unknown, version: number) =>
      catalogSave(key, structuredClone(draft), version),
  },
  watchDesktopChanges: () => () => undefined,
}));

const local = new Map<string, string>();
const dropped = (table: string): Draft => ({ ...EMPTY_DRAFT, droppedTables: [table] });
catalog.set("db1", { draft: dropped("a"), version: 3 });
local.set(STORAGE_KEYS.visDraft + "db2", JSON.stringify(dropped("old")));

let drafts: typeof import("@/features/vis/lib/drafts");
beforeAll(async () => {
  Object.assign(globalThis, {
    window: {
      localStorage: Object.assign(Object.create(null), {
        getItem: (k: string) => local.get(k) ?? null,
        setItem: (k: string, v: string) => local.set(k, v),
        removeItem: (k: string) => local.delete(k),
      }),
    },
  });
  // Object.keys(localStorage) lists stored keys in a browser; mirror that.
  Object.defineProperty(window.localStorage, STORAGE_KEYS.visDraft + "db2", {
    enumerable: true,
    get: () => local.get(STORAGE_KEYS.visDraft + "db2"),
  });
  drafts = await import("@/features/vis/lib/drafts");
  await drafts.reloadDrafts();
});

describe("schema designs on desktop", () => {
  test("loads stored designs and moves drafts kept in the window's own storage", async () => {
    expect(drafts.readDraft("db1").droppedTables).toEqual(["a"]);
    expect(drafts.hasUnsavedDesign("db1")).toBe(true);
    expect(drafts.hasUnsavedDesign("none")).toBe(false);
    await drafts.reloadDrafts();
    expect(catalog.get("db2")).toEqual({ draft: dropped("old"), version: 1 });
    expect(local.size).toBe(0);
  });

  test("saves each edit over the version the last one left", async () => {
    drafts.writeDraft("db1", dropped("b"));
    drafts.writeDraft("db1", dropped("c"));
    expect(drafts.readDraft("db1").droppedTables).toEqual(["c"]);
    await drafts.reloadDrafts();
    expect(catalog.get("db1")!.draft).toEqual(dropped("c"));
    expect(warnings).toEqual([]);
  });

  test("shows a design an assistant saved", async () => {
    const version = catalog.get("db1")!.version;
    catalogSave("db1", dropped("from-assistant"), version);
    await drafts.reloadDrafts();
    expect(drafts.readDraft("db1").droppedTables).toEqual(["from-assistant"]);
  });

  test("an edit racing an assistant's save is refused, and the assistant's version shows", async () => {
    catalogSave("db1", dropped("assistant-2"), catalog.get("db1")!.version);
    drafts.writeDraft("db1", dropped("mine"));
    await drafts.reloadDrafts();
    expect(catalog.get("db1")!.draft).toEqual(dropped("assistant-2"));
    expect(drafts.readDraft("db1").droppedTables).toEqual(["assistant-2"]);
    expect(warnings).toHaveLength(1);
  });
});
