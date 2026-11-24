import { beforeEach, describe, expect, test } from "vitest";
import { useWorkspace } from "@/store/workspace";

describe("the Assistant tab", () => {
  beforeEach(() => useWorkspace.setState({ tabs: [], activeTabId: null, queryCounter: 0 }));

  test("queries an assistant shows reuse one tab instead of opening a new one each time", () => {
    const ws = useWorkspace.getState();
    ws.openQuery("SELECT 'mine'");
    ws.showAssistantQuery("SELECT 1");
    ws.showAssistantQuery("SELECT 2");

    const { tabs, activeTabId } = useWorkspace.getState();
    const assistant = tabs.filter((t) => t.kind === "query" && t.assistant);
    expect(tabs).toHaveLength(2);
    expect(assistant).toHaveLength(1);
    expect(assistant[0]).toMatchObject({ title: "Assistant", sql: "SELECT 2" });
    expect(activeTabId).toBe(assistant[0]!.id);
    // The user's own query tab is left alone.
    expect(tabs[0]).toMatchObject({ title: "Query 1", sql: "SELECT 'mine'" });
  });

  test("a closed Assistant tab comes back", () => {
    const ws = useWorkspace.getState();
    ws.showAssistantQuery("SELECT 1");
    ws.closeTab(useWorkspace.getState().activeTabId!);
    ws.showAssistantQuery("SELECT 3");
    expect(useWorkspace.getState().tabs).toMatchObject([{ title: "Assistant", sql: "SELECT 3" }]);
  });
});
