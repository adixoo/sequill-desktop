import { expect, test } from "@playwright/test";

// A fresh install: nothing in storage, so the guide hasn't been seen yet.
test.use({ storageState: { cookies: [], origins: [] } });

test("the welcome guide opens on the first start only, and again from the palette", async ({
  page,
}) => {
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "Welcome to Sequill" });
  await expect(guide).toBeVisible({ timeout: 30_000 });
  await expect(guide).toContainText("Design the schema");
  await guide.getByRole("button", { name: "Get started" }).click();
  await expect(guide).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Open a database to begin" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(guide).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "Show the welcome guide" }).click();
  await expect(guide).toBeVisible();
});
