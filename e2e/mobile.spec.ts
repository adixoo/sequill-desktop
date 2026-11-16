import { expect, test } from "@playwright/test";
import { createSample, openTable } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("on phones, forms open as a bottom drawer that a drag down closes", async ({ page }) => {
  await createSample(page);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.getByRole("button", { name: "New table" }).first().click();

  const drawer = page.getByRole("dialog", { name: "New table" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Table name")).toBeFocused();
  // Measured once the slide-in has finished: full width, resting on the bottom edge.
  const bottom = async () => {
    const b = (await drawer.boundingBox())!;
    return Math.round(b.y + b.height);
  };
  await expect.poll(bottom).toBe(844);
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(390);
  // The footer stays on screen however tall the form is.
  await expect(drawer.getByRole("button", { name: "Cancel" })).toBeInViewport({ ratio: 1 });

  // A short drag springs back; a long one closes the drawer.
  const handle = { x: 195, y: box.y + 10 };
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect(drawer).toBeVisible();
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y + 300, { steps: 15 });
  await page.mouse.up();
  await expect(drawer).toBeHidden();
});

test("the tab strip slides with the wheel, a mouse drag and the arrows", async ({ page }) => {
  await createSample(page);
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "New query" }).first().click();
  const strip = page.getByRole("tablist", { name: "Open tabs" });
  const scrollLeft = () => strip.evaluate((el) => el.scrollLeft);
  const toStart = () => strip.evaluate((el) => (el.scrollLeft = 0));

  // The newest tab is active and scrolled into view, with older tabs hidden to its left.
  await expect(page.getByRole("button", { name: "Scroll tabs left" })).toBeVisible();

  await toStart();
  await expect(page.getByRole("button", { name: "Scroll tabs left" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Scroll tabs right" })).toBeVisible();
  const box = (await strip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(scrollLeft).toBeGreaterThan(100);

  await toStart();
  await page.getByRole("button", { name: "Scroll tabs right" }).click();
  await expect.poll(scrollLeft).toBeGreaterThan(100);

  // A drag slides the strip and doesn't switch to the tab it started on.
  await toStart();
  const active = strip.getByRole("tab", { selected: true });
  const before = await active.textContent();
  const first = (await strip.getByRole("tab").first().boundingBox())!;
  await page.mouse.move(first.x + first.width / 2 + 60, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 - 100, first.y + first.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(scrollLeft).toBeGreaterThan(100);
  await expect(active).toHaveText(before!);
});

test("the table toolbar labels its buttons and scrolls to the ones that don't fit", async ({
  page,
}) => {
  await createSample(page);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await openTable(page, "orders");
  await expect(page.getByRole("radio", { name: "Data" })).toHaveText("Data");
  const toolbar = page.getByRole("toolbar", { name: "orders actions" });
  await expect(toolbar.getByRole("button", { name: "Filters" })).toContainText("Filter");

  const addRow = toolbar.getByRole("button", { name: "Add row" });
  await expect(addRow).not.toBeInViewport();
  while (await page.getByRole("button", { name: "Scroll actions right" }).isVisible()) {
    await page.getByRole("button", { name: "Scroll actions right" }).click();
    await page.waitForTimeout(250);
  }
  await expect(addRow).toBeInViewport({ ratio: 0.95 });
  await addRow.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
