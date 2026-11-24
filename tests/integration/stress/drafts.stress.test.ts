/**
 * Stress: the designer and an assistant saving the same design at once, 2,000 times, against
 * a fake catalog with the real versioning rules. The stored design must never go back to an
 * older version, and the designer must end on what the catalog holds.
 */
import { beforeAll, describe, expect, test, vi } from "vitest";
import { EMPTY_DRAFT, type Draft } from "@/features/vis/lib/model";
import { random, SEED } from "../../helpers/random";

const { catalog, history, catalogSave, delay } = vi.hoisted(() => {
  const catalog = new Map<string, { draft: unknown; version: number }>();
  const history: number[] = [];
  let pending = 0;
  const catalogSave = (key: string, draft: unknown, version: number): number | null => {
    if ((catalog.get(key)?.version ?? 0) !== version) return null;
    catalog.set(key, { draft: structuredClone(draft), version: version + 1 });
    history.push(version + 1);
    return version + 1;
  };
  // Each catalog call settles after a random number of microtask turns, like IPC.
  const delay = async () => {
    pending = (pending * 1103515245 + 12345) & 0x7fffffff;
    for (let i = pending % 4; i > 0; i--) await Promise.resolve();
  };
  return { catalog, history, catalogSave, delay };
});
vi.mock("@/lib/platform", () => ({ isDesktop: () => true }));
vi.mock("@/components/atoms/toast", () => ({
  toast: { warning: () => undefined, error: () => undefined },
}));
vi.mock("@/lib/sqlite/desktop", () => ({
  desktopDesigns: {
    list: async () => {
      await delay();
      return [...catalog].map(([key, d]) => ({ key, ...structuredClone(d) }));
    },
    save: async (key: string, draft: unknown, version: number) => {
      await delay();
      return catalogSave(key, draft, version);
    },
  },
  watchDesktopChanges: () => () => undefined,
}));

let drafts: typeof import("@/features/vis/lib/drafts");
beforeAll(async () => {
  const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  Object.assign(globalThis, { window: { localStorage: storage } });
  drafts = await import("@/features/vis/lib/drafts");
  await drafts.reloadDrafts();
});

const marked = (who: string, n: number): Draft => ({
  ...EMPTY_DRAFT,
  droppedTables: [`${who}-${n}`],
});

describe(`designer and assistant racing (seed ${SEED})`, () => {
  test("2,000 interleaved edits never lose the newest version", async () => {
    const r = random(SEED + 30);
    const key = "race";
    for (let i = 0; i < 2_000; i++) {
      if (r.chance(0.6)) drafts.writeDraft(key, marked("user", i));
      else {
        // The assistant reads the latest version and saves over it, as set_design does.
        const current = catalog.get(key)?.version ?? 0;
        catalogSave(key, marked("assistant", i), current);
      }
      if (r.chance(0.1)) await drafts.reloadDrafts();
    }
    await drafts.reloadDrafts();

    // Versions only ever go up by one.
    history.forEach((v, i) => i > 0 && expect(v).toBe(history[i - 1] + 1));
    // The designer shows exactly what the catalog holds.
    expect(drafts.readDraft(key)).toEqual(catalog.get(key)!.draft);
  });
});
