import { expect, type Page } from "@playwright/test";

/** Opens the editor and waits for SQLite to finish booting. */
export async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Open a database to begin|Pick a table/ }),
  ).toBeVisible({ timeout: 30_000 });
}

export async function createSample(page: Page): Promise<void> {
  await openEditor(page);
  await page.getByRole("button", { name: "Try the sample" }).click();
  // Building the sample writes a few thousand rows; with every worker busy it can take a while.
  await expect(page.getByRole("heading", { name: /Pick a table/ })).toBeVisible({
    timeout: 30_000,
  });
}

export async function openTable(page: Page, name: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Database" })
    // The button's name is the table name followed by its row count.
    .getByRole("button", { name: new RegExp(`^${name}( [\\d,]+)?$`) })
    .first()
    .click();
  await expect(page.getByRole("grid", { name: `${name} rows` })).toBeVisible();
}

/** Cell text by 1-based data row and 0-based column. */
export function cell(page: Page, row: number, col: number) {
  return page
    .locator(`[role=grid] [role=row][aria-rowindex="${row + 1}"] [role=gridcell]`)
    .nth(col);
}

/** Asserts the total row count shown in the table footer ("61 rows · 3 ms"). */
export async function expectRowCount(page: Page, n: number): Promise<void> {
  await expect(page.locator("footer p").first()).toHaveText(
    new RegExp(`^${n.toLocaleString("en")} rows?( ·|$)`),
  );
}

/** Opens the CSV/JSON import dialog from the command palette. */
export async function openImport(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("dialog", { name: "Jump to" })
    .getByRole("option", { name: "Import CSV or JSON" })
    .click();
}

/** Types SQL into a new console tab and runs it (Ctrl+Enter). */
export async function runSql(page: Page, sql: string): Promise<void> {
  await page.getByRole("button", { name: "New query" }).first().click();
  await page.locator(".cm-content").last().click();
  await page.keyboard.insertText(sql);
  await page.keyboard.press("Control+Enter");
}

/** Waits for the console's "Done. N rows changed" line after a write. */
export async function expectChanged(page: Page, rows: number): Promise<void> {
  await expect(
    page.getByText(new RegExp(`^Done[.] ${rows.toLocaleString("en")} rows? changed`)).last(),
  ).toBeVisible({ timeout: 60_000 });
}
