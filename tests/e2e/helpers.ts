import { expect, type Page } from "@playwright/test";

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
