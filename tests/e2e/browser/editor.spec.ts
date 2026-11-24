import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { cell, createSample, expectRowCount, openEditor, openImport, openTable } from "../helpers";

test("the editor boots behind a loader at the root", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a database to begin" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveTitle("Editor · Sequill");
});

test("edits a cell and the change survives a reload", async ({ page }) => {
  await createSample(page);
  await openTable(page, "orders");

  const status = cell(page, 4, 3);
  await status.dblclick();
  const input = page.getByRole("textbox", { name: "Edit status" });
  await input.fill("bogus");
  await input.press("Enter");
  await expect(page.getByText(/CHECK constraint failed/)).toBeVisible();
  await expect(cell(page, 4, 3)).not.toHaveText("bogus");

  await cell(page, 4, 3).dblclick();
  await page.getByRole("textbox", { name: "Edit status" }).fill("paid");
  await page.keyboard.press("Enter");
  await expect(cell(page, 4, 3)).toHaveText("paid");

  await page.reload();
  await expect(page.getByRole("heading", { name: /Pick a table/ })).toBeVisible({
    timeout: 30_000,
  });
  await openTable(page, "orders");
  await expect(cell(page, 4, 3)).toHaveText("paid");
});

test("sorts, searches and filters through SQLite", async ({ page }) => {
  await createSample(page);
  await openTable(page, "orders");
  await expectRowCount(page, 150);

  await page
    .getByRole("columnheader", { name: /ordered_at/ })
    .getByRole("button")
    .first()
    .click();
  await page
    .getByRole("columnheader", { name: /ordered_at/ })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByRole("columnheader", { name: /ordered_at/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await expect(cell(page, 1, 2)).toHaveText("2024-10-18 16:09:00");

  await page.getByRole("searchbox", { name: "Search orders" }).fill("gift");
  await expectRowCount(page, 13);
  await page.getByRole("searchbox", { name: "Search orders" }).fill("");

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("combobox", { name: "Column" }).click();
  await page.getByRole("option", { name: "status" }).click();
  await page.getByRole("combobox", { name: "Condition" }).click();
  await page.getByRole("option", { name: "equals", exact: true }).click();
  await page.getByRole("textbox", { name: "Value" }).fill("cancelled");
  await page.getByRole("button", { name: "Apply" }).click();
  await expectRowCount(page, 15);
});

test("adds a row from the inspector and deletes it", async ({ page }) => {
  await createSample(page);
  await openTable(page, "customers");
  await expectRowCount(page, 60);

  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByLabel("name", { exact: true }).fill("Zoe Test");
  await page.getByLabel("email", { exact: true }).fill("zoe@example.com");
  await page.getByRole("button", { name: "Insert row" }).click();
  await expectRowCount(page, 61);

  await page.getByRole("searchbox", { name: "Search customers" }).fill("zoe@example");
  await expectRowCount(page, 1);
  await page.getByRole("button", { name: "Select row 1", exact: true }).click();
  await page.getByRole("button", { name: /^Delete 1$/ }).click();
  await expect(page.getByRole("alertdialog")).toContainText("DELETE FROM");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expectRowCount(page, 0);
});

test("runs SQL in the console with one result per statement", async ({ page }) => {
  await createSample(page);
  await page.getByRole("button", { name: "New query" }).first().click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.insertText("SELECT count(*) AS n FROM products;\nSELECT name FROM nope;");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("alert").filter({ hasText: "no such table" })).toContainText(
    "no such table: nope",
  );
  await page.getByRole("tab", { name: /SELECT count/ }).click();
  await expect(page.getByRole("grid", { name: "Query results" })).toContainText("40");
});

test("creates a table, adds a column and shows it in the structure", async ({ page }) => {
  await createSample(page);
  await page.getByRole("button", { name: "New table" }).first().click();
  await page.getByLabel("Table name").fill("notes");
  await page.getByRole("textbox", { name: "Column name" }).nth(1).fill("body");
  await expect(page.getByRole("dialog")).toContainText('CREATE TABLE "notes"');
  await page.getByRole("button", { name: "Create table" }).click();
  await expect(page.getByRole("grid", { name: "notes rows" })).toBeVisible();

  await page.getByRole("radio", { name: "Structure" }).click();
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("pinned");
  await page.getByRole("button", { name: "Add column" }).last().click();
  await expect(page.getByRole("table")).toContainText("pinned");
});

test("imports a CSV file into a new table with detected types", async ({ page }) => {
  await createSample(page);
  await openImport(page);
  await page
    .locator('input[type=file][accept*=".csv"]')
    .setInputFiles(join(__dirname, "..", "..", "fixtures", "people.csv"));
  await expect(page.getByRole("dialog")).toContainText('"zip" TEXT');
  await expect(page.getByRole("dialog")).toContainText('"age" INTEGER');
  await page.getByRole("button", { name: "Import 3 rows" }).click();
  await expect(page.getByRole("grid", { name: "people rows" })).toBeVisible();
  await expectRowCount(page, 3);
  await expect(page.getByRole("grid", { name: "people rows" })).toContainText('Chloé "Clo" Martin');
  await expect(page.getByRole("grid", { name: "people rows" })).toContainText("02903");
});

test("exports CSV and downloads the database file", async ({ page }) => {
  await createSample(page);
  await openTable(page, "products");
  await page.getByRole("button", { name: "Export" }).click();
  const csv = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /^CSV/ }).click();
  const csvFile = await csv;
  expect(csvFile.suggestedFilename()).toBe("products.csv");

  await page.getByRole("button", { name: /Sample shop/ }).click();
  const db = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download .sqlite" }).click();
  const dbFile = await db;
  expect(dbFile.suggestedFilename()).toBe("Sample_shop.sqlite");
});

test("theme toggle switches between light and dark", async ({ page }) => {
  // Dark is the default, even when the system prefers light; there's no "system" mode.
  await page.emulateMedia({ colorScheme: "light" });
  await openEditor(page);
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("button", { name: /^Theme: dark/ }).click();
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: /^Theme: light/ }).click();
  await expect(html).toHaveClass(/dark/);
});

test("the command palette opens with Ctrl+K and jumps to a table", async ({ page }) => {
  await createSample(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Jump to" });
  await palette.getByPlaceholder("Search tables, views, actions…").fill("open products");
  await palette.getByRole("option", { name: "products" }).first().click();
  await expect(palette).toBeHidden();
  await expect(page.getByRole("grid", { name: "products rows" })).toBeVisible();
});

test("saves a query, keeps it across reloads, and renames and deletes it", async ({ page }) => {
  await createSample(page);
  await page.getByRole("button", { name: "New query" }).first().click();
  await page.locator(".cm-content").click();
  await page.keyboard.insertText("-- Top products\nSELECT name FROM products LIMIT 3;");

  // The first save asks for a name, suggested from the leading comment.
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Save query" });
  await expect(dialog.getByLabel("Name")).toHaveValue("Top products");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("tab", { name: "Top products", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeDisabled();
  const sidebar = page.getByRole("navigation", { name: "Database" });
  await expect(sidebar.getByRole("button", { name: "Top products", exact: true })).toBeVisible();

  // Edits mark the tab; saving again updates the query without asking.
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n-- edited");
  await expect(page.getByRole("tab", { name: "Top products (unsaved changes)" })).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { name: "Top products", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Pick a table/ })).toBeVisible({
    timeout: 30_000,
  });
  await sidebar.getByRole("button", { name: "Top products", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("-- edited");

  await sidebar.getByRole("button", { name: "Actions for Top products" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename saved query" });
  await rename.getByLabel("Name").fill("Best sellers");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("tab", { name: "Best sellers", exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "Actions for Best sellers" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(sidebar.getByRole("button", { name: "Best sellers", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(sidebar.getByRole("button", { name: "Best sellers", exact: true })).toBeVisible();
});

test("opens a database file from the database switcher", async ({ page }) => {
  await createSample(page);
  await page.getByRole("button", { name: /^Database: / }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Open a file…" }).click();
  // A person picks the file after the menu has closed, not while it's still on screen.
  await expect(page.getByRole("menu")).toBeHidden();
  await (await chooser).setFiles(join(__dirname, "..", "..", "fixtures", "notes.sqlite"));
  await expect(page.getByRole("button", { name: /^Database: / })).toHaveAccessibleName(
    "Database: notes",
    { timeout: 30_000 },
  );
});

test("right-clicking a tab offers close and duplicate actions", async ({ page }) => {
  await createSample(page);
  await openTable(page, "orders");
  const tablist = page.getByRole("tablist", { name: "Open tabs" });
  const tabs = tablist.getByRole("tab");
  await page.getByRole("button", { name: "New query" }).first().click();
  await page.getByRole("button", { name: "New query" }).first().click();
  await expect(tabs).toHaveCount(3);

  await tabs.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close tabs to the right" }).click();
  await expect(tabs).toHaveCount(2);

  await tabs.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate query" }).click();
  await expect(tabs).toHaveCount(3);

  await tabs.nth(0).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Duplicate query" })).toBeHidden();
  await page.getByRole("menuitem", { name: "Close others" }).click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveText("orders");
});

test("an open table keeps working when its columns change while it is on screen", async ({
  page,
}) => {
  await createSample(page);
  await openTable(page, "customers");
  const grid = page.getByRole("grid", { name: "customers rows" });
  // Added from the sidebar, the grid stays on screen with its rows while the schema changes,
  // as it does when an assistant changes the table over MCP.
  await page.getByRole("button", { name: "Actions for customers" }).click();
  await page.getByRole("menuitem", { name: "Add column" }).click();
  await page.getByRole("textbox", { name: "Column name" }).fill("loyalty_points");
  await page.getByRole("button", { name: "Add column" }).last().click();

  await expect(grid.getByRole("columnheader", { name: /^loyalty_points/ })).toBeVisible();
  await expect(grid).toContainText("Asha");
});
