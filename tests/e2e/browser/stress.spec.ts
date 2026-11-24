/**
 * Stress, end to end in the browser build: large tables, large imports and a large schema,
 * driven through the UI exactly as a person would.
 */
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { random } from "../../helpers/random";
import {
  cell,
  createSample,
  expectChanged,
  expectRowCount,
  openImport,
  openTable,
  runSql,
} from "../helpers";

test.describe.configure({ timeout: 180_000 });

test("200,000 rows: counts, the last page, search and paging stay right", async ({ page }) => {
  await createSample(page);
  await runSql(
    page,
    `CREATE TABLE big (id INTEGER PRIMARY KEY, label TEXT, n INTEGER);
WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 200000)
INSERT INTO big SELECT x, 'row ' || x, x % 97 FROM c;`,
  );
  await expectChanged(page, 200_000);

  await openTable(page, "big");
  await expectRowCount(page, 200_000);
  // The last page (250 rows a page) starts at row 199,751.
  await page.getByRole("button", { name: "Last page" }).click();
  await expect(page.getByRole("grid", { name: "big rows" })).toContainText("row 199751");

  // 'row 19999' matches row 19999 and rows 199990…199999: 11 rows.
  await page.getByRole("searchbox", { name: "Search big" }).fill("row 19999");
  await expectRowCount(page, 11);
  await page.getByRole("searchbox", { name: "Search big" }).fill("");
  await expectRowCount(page, 200_000);
  // Changing the search goes back to the first page.
  await expect(page.getByRole("button", { name: "First page" })).toBeDisabled();
  await expect(cell(page, 1, 1)).toHaveText("row 1");
});

test("imports a 30,000-row CSV full of quotes, commas, line breaks and non-ASCII", async ({
  page,
}, info) => {
  const r = random();
  const field = (text: string) => `"${text.replace(/"/g, '""')}"`;
  const lines = ["id,name,score"];
  for (let i = 1; i <= 30_000; i++) {
    const name = `${r.pick(["Zoë", 'Al "Big"', "日本", "a,b", "line\nbreak"])} ${i}`;
    lines.push(`${i},${field(name)},${(i % 1000) / 10}`);
  }
  const file = info.outputPath("big.csv");
  writeFileSync(file, lines.join("\r\n"));

  await createSample(page);
  await openImport(page);
  await page.locator('input[type=file][accept*=".csv"]').setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText('"score" REAL');
  await page.getByRole("button", { name: "Import 30,000 rows" }).click();
  await expect(page.getByRole("grid", { name: "big rows" })).toBeVisible({ timeout: 60_000 });
  await expectRowCount(page, 30_000);
  await page.getByRole("searchbox", { name: "Search big" }).fill('Al "Big" 29999');
  await expectRowCount(page, 1);
});

test("the designer draws 150 linked tables and saves a new table into them", async ({ page }) => {
  await createSample(page);
  const tables = Array.from(
    { length: 150 },
    (_, i) =>
      `CREATE TABLE s${i} (id INTEGER PRIMARY KEY, name TEXT${i > 0 ? `, prev_id INTEGER REFERENCES s${i - 1}(id)` : ""});`,
  );
  await runSql(page, tables.join("\n"));
  await expect(page.getByText(/^Done\./).first()).toBeVisible({ timeout: 60_000 });

  await page.goto("/vis");
  const nodes = page.locator('.react-flow__node[data-id^="t:s"]');
  await expect(nodes).toHaveCount(150, { timeout: 60_000 });
  await expect(page.locator(".react-flow__edge")).toHaveCount(149 + 3);

  await page.getByRole("button", { name: "Auto-arrange tables" }).click();
  await page.getByRole("button", { name: "Add table" }).first().click();
  await page.getByRole("button", { name: "Save options" }).click();
  await page.getByRole("menuitem", { name: /Review and save to Sample shop/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Save to database" }).click();
  await expect(page.locator('.react-flow__node[data-id="t:table_1"]')).toBeVisible();
  await expect(nodes).toHaveCount(150);
});
