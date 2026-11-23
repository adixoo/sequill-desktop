/**
 * The real desktop app end to end: the React UI, Tauri's IPC, the Rust engine on real files,
 * and the MCP server an assistant starts. Each test runs on a fresh data folder.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { cell, expectChanged, expectRowCount, openTable, runSql } from "../helpers";
import { expect, test, type McpClient } from "./app";

test.describe.configure({ timeout: 180_000 });

/** Closes the first-run guide, which a fresh install shows. */
async function getStarted(page: Page): Promise<void> {
  const guide = page.getByRole("dialog", { name: "Welcome to Sequill" });
  await expect(guide).toBeVisible({ timeout: 30_000 });
  await guide.getByRole("button", { name: "Get started" }).click();
  await expect(guide).toHaveCount(0);
}

async function trySample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Try the sample" }).click();
  await expect(page.getByRole("heading", { name: /Pick a table/ })).toBeVisible({
    timeout: 30_000,
  });
}

/** Turns on "Let assistants use Sequill" and "Allow changes" in the MCP dialog. */
async function allowAssistants(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^MCP: / }).click();
  const dialog = page.getByRole("dialog", { name: "Connect an AI assistant" });
  for (const name of ["Let assistants use Sequill", "Allow changes"]) {
    const toggle = dialog.getByRole("switch", { name });
    await toggle.click();
    await expect(toggle).toBeChecked();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

const sidebarTable = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Database" })
    .getByRole("button", { name: new RegExp(`^${name}( [\\d,]+)?$`) });

test("first start shows the guide once; edits reach the file and survive a restart", async ({
  launch,
  dataDir,
}) => {
  let app = await launch();
  await getStarted(app.page);
  await expect(app.page.getByRole("button", { name: /^MCP: / })).toBeVisible();
  await trySample(app.page);
  await openTable(app.page, "orders");
  await cell(app.page, 4, 3).dblclick();
  await app.page.getByRole("textbox", { name: "Edit status" }).fill("paid");
  await app.page.keyboard.press("Enter");
  await expect(cell(app.page, 4, 3)).toHaveText("paid");
  // A real SQLite file in the data folder, not browser storage.
  expect(readdirSync(join(dataDir, "databases")).some((f) => f.endsWith(".sqlite3"))).toBe(true);
  await app.close();

  app = await launch();
  await expect(app.page.getByRole("heading", { name: /Pick a table/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(app.page.getByRole("dialog", { name: "Welcome to Sequill" })).toHaveCount(0);
  await openTable(app.page, "orders");
  await expect(cell(app.page, 4, 3)).toHaveText("paid");
});

test("an assistant's changes show in the open app, and it keeps working after the app closes", async ({
  launch,
  mcp,
  dataDir,
}) => {
  let app = await launch();
  await getStarted(app.page);
  await trySample(app.page);
  await allowAssistants(app.page);

  const assistant = await mcp();
  expect(await assistant.call("list_databases")).toContain("Sample shop");
  await assistant.call("execute", {
    database: "Sample shop",
    sql: "CREATE TABLE from_ai (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO from_ai (note) VALUES ('hello');",
  });
  // The app notices the outside change by itself (no reload).
  await expect(sidebarTable(app.page, "from_ai")).toBeVisible({ timeout: 10_000 });

  // A design proposed over MCP appears in the open schema designer.
  const { version } = JSON.parse(await assistant.call("get_design", { database: "Sample shop" }));
  await assistant.call("set_design", {
    database: "Sample shop",
    version,
    draft: {
      tables: [
        {
          id: "ai1",
          name: "ai_plan",
          columns: [{ name: "id", type: "INTEGER", primaryKey: true }],
        },
      ],
    },
  });
  await app.page.getByRole("link", { name: "Schema" }).click();
  await expect(app.page.locator('.react-flow__node[data-id="d:ai1"]')).toContainText("ai_plan", {
    timeout: 15_000,
  });

  await app.close();
  // Sequill is closed: sequill mcp runs the call itself on the same folder.
  await assistant.call("insert_rows", {
    database: "Sample shop",
    table: "from_ai",
    rows: [{ note: "while closed" }],
  });
  expect(existsSync(join(dataDir, "catalog.sqlite3"))).toBe(true);

  app = await launch();
  await expect(app.page.getByRole("heading", { name: /Pick a table/ })).toBeVisible({
    timeout: 30_000,
  });
  await openTable(app.page, "from_ai");
  await expectRowCount(app.page, 2);
});

test("a pasted PostgreSQL schema becomes the saved schema to design on", async ({ launch }) => {
  const { page } = await launch();
  await getStarted(page);
  await page.getByRole("link", { name: "Schema" }).click();
  await page.getByRole("button", { name: /^Database: / }).click();
  await page.getByRole("menuitem", { name: "Import a schema…" }).click();

  const dialog = page.getByRole("dialog", { name: "Import a schema" });
  await dialog.getByRole("textbox", { name: "Paste the schema" }).fill(
    `CREATE TABLE public.customer (id serial PRIMARY KEY, email varchar(255) NOT NULL UNIQUE);
CREATE TABLE public."order" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
  total numeric(10,2) DEFAULT 0
);
CREATE FUNCTION touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;`,
  );
  await expect(dialog.getByRole("combobox", { name: "Written for" })).toHaveText("PostgreSQL");
  await dialog.getByRole("textbox", { name: "Database name" }).fill("Shop (Postgres)");
  await dialog.getByRole("button", { name: "Import" }).click();

  await expect(page.getByText("Left out (no SQLite equivalent): CREATE FUNCTION")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Database: Shop \(Postgres\)/ })).toBeVisible();
  const customer = page.locator('.react-flow__node[data-id="t:customer"]');
  await expect(customer).toContainText("VARCHAR(255)");
  await expect(page.locator('.react-flow__node[data-id="t:order"]')).toContainText("NUMERIC(10,2)");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  // It is the saved schema: nothing is waiting to be saved until you design on it.
  await expect(page.getByRole("button", { name: /^Unsaved/ })).toHaveCount(0);
});

test("stress: 4 assistant sessions write 200 rows at once while a person runs 200,000-row SQL", async ({
  launch,
  mcp,
}) => {
  const app = await launch();
  await getStarted(app.page);
  await trySample(app.page);
  await allowAssistants(app.page);

  const sessions = await Promise.all([mcp(), mcp(), mcp(), mcp()]);
  await sessions[0].call("execute", {
    database: "Sample shop",
    sql: "CREATE TABLE hits (id INTEGER PRIMARY KEY, who INTEGER NOT NULL, n INTEGER NOT NULL);",
  });

  // SQLite has one writer at a time and waits 5 s for it; a write that times out changes
  // nothing and says "database is locked", so an assistant retries it, as these do.
  const insert = async (assistant: McpClient, who: number, n: number) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await assistant.call("insert_rows", {
          database: "Sample shop",
          table: "hits",
          rows: [{ who, n }],
        });
      } catch (error) {
        if (attempt >= 10 || !/database is locked/.test(String(error))) throw error;
      }
    }
  };
  const writes = sessions.flatMap((assistant, who) =>
    Array.from({ length: 50 }, (_, n) => insert(assistant, who, n)),
  );
  const big = runSql(
    app.page,
    `CREATE TABLE big (id INTEGER PRIMARY KEY, label TEXT);
WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 200000)
INSERT INTO big SELECT x, 'row ' || x FROM c;`,
  );
  await Promise.all([...writes, big]);
  await expectChanged(app.page, 200_000);

  const counted = JSON.parse(
    await sessions[1].call("query", {
      database: "Sample shop",
      // Every write landed exactly once: no losses, no duplicates from the retries.
      sql: "SELECT count(*), count(DISTINCT who || ':' || n) FROM hits",
    }),
  );
  expect(counted.rows).toEqual([[200, 200]]);

  await openTable(app.page, "hits");
  await expectRowCount(app.page, 200);
  await openTable(app.page, "big");
  await expectRowCount(app.page, 200_000);
  // The last page (250 rows a page) starts at row 199,751.
  await app.page.getByRole("button", { name: "Last page" }).click();
  await expect(app.page.getByRole("grid", { name: "big rows" })).toContainText("row 199751");
});
