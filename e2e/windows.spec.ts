import { expect, test, type Page } from "@playwright/test";
import { createSample, openEditor, openTable } from "./helpers";

const database = (page: Page) => page.getByRole("navigation", { name: "Database" });
const elsewhere = (page: Page) => page.getByText(/open in another window/i);

// Databases live in files only one window can hold at a time, like the installed app and a
// browser tab of the same site. Opening the editor again must hand them over, not fail.
test("a second window takes over the databases, and the first can take them back", async ({
  page,
  context,
}) => {
  await createSample(page);

  const second = await context.newPage();
  await openEditor(second);
  await expect(database(second)).toContainText("customers");
  await openTable(second, "customers");

  await page.bringToFront();
  // A window that was still showing hands over and says so; one that was in the
  // background takes the databases back by itself when it is shown again.
  const useHere = page.getByRole("button", { name: "Use here" });
  if (await useHere.isVisible()) await useHere.click();
  await expect(elsewhere(page)).toBeHidden();
  await openTable(page, "orders");

  await second.bringToFront();
  const useHereSecond = second.getByRole("button", { name: "Use here" });
  if (await useHereSecond.isVisible()) await useHereSecond.click();
  await openTable(second, "products");
});

test("a window that was handed over says so until it is used again", async ({ page, context }) => {
  await createSample(page);
  const second = await context.newPage();
  await openEditor(second);
  await expect(database(second)).toContainText("customers");

  // Both windows stay on screen (side by side), so the first one keeps showing.
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  await expect(elsewhere(page)).toBeVisible();
  await page.getByRole("button", { name: "Use here" }).click();
  await expect(elsewhere(page)).toBeHidden();
  await expect(database(page)).toContainText("customers");
  await expect(elsewhere(second)).toBeVisible();
});
