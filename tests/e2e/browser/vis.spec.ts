import { expect, test, type Page } from "@playwright/test";
import { createSample } from "../helpers";

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const edges = (page: Page) => page.locator(".react-flow__edge");

/** The header badge shown while the design has unsaved changes; a click saves. */
const unsavedBadge = (page: Page) =>
  page.getByRole("button", { name: /^Unsaved (changes|design)/ });

/** Saves the design into the open database after reviewing its SQL. */
async function saveToDatabase(page: Page, dbName = "Sample shop") {
  await page.getByRole("button", { name: "Save options" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`Review and save to ${dbName}`) }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Save to database" }).click();
}

/** The database menu shared by the editor and the schema page. */
const switcher = (page: Page) => page.getByRole("button", { name: /^Database: / });

async function switchTo(page: Page, name: string) {
  await switcher(page).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
}

async function openVisualizer(page: Page) {
  await page.goto("/vis");
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
}

test("draws a database's tables and foreign keys", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(edges(page)).toHaveCount(3);
  await expect(node(page, "t:order_totals")).toContainText("view");
  // No details panel until something is selected.
  await expect(page.getByRole("complementary", { name: "Details" })).toHaveCount(0);

  // The outline on the left lists every table with its columns and types.
  const outline = page.getByRole("navigation", { name: "Tables and columns" });
  const orderColumns = outline.getByRole("list", { name: "orders columns" });
  // Tables start collapsed; expanding one shows its columns.
  await expect(orderColumns).toHaveCount(0);
  await outline.getByRole("button", { name: "Expand orders" }).click();
  await expect(orderColumns).toContainText("customer_id");
  await expect(orderColumns.getByRole("button", { name: /^Edit column/ })).toHaveCount(5);
  await expect(orderColumns.getByRole("listitem").nth(1)).toContainText("INTEGER");
  await outline.getByRole("searchbox", { name: "Find a table or column" }).fill("price");
  await expect(outline.getByRole("button", { name: /^products/ })).toBeVisible();
  await expect(outline.getByRole("button", { name: /^customers/ })).toHaveCount(0);
  await outline.getByRole("searchbox", { name: "Find a table or column" }).fill("");
  await outline.getByRole("button", { name: /^orders/ }).click();
  await expect(node(page, "t:orders")).toHaveClass(/selected/);
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText("150 rows");
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("complementary", { name: "Details" })).toHaveCount(0);

  // The sidebar can be hidden from its header and brought back from the toolbar; it stays as left.
  await outline.getByRole("button", { name: "Hide tables sidebar" }).click();
  await expect(outline).toBeHidden();
  await page.reload();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
  await expect(outline).toBeHidden();
  await page.getByRole("button", { name: "Show tables sidebar" }).click();
  await expect(outline).toBeVisible();

  // Selecting a table shows its details and a link into the editor.
  await node(page, "t:customers").click();
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText("60 rows");
  await page.getByRole("link", { name: "Open in editor" }).click();
  await expect(page.getByRole("grid", { name: "customers rows" })).toBeVisible({ timeout: 30_000 });
});

test("designs a new related table and applies it to the database", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);

  await page.getByRole("button", { name: "Add table" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("reviews");
  const details = page.getByRole("complementary", { name: "Details" });
  await details.getByRole("button", { name: "Add column" }).click();
  await details.getByRole("textbox", { name: "Column name" }).nth(1).fill("product_id");

  const draftNode = page.locator('.react-flow__node[data-id^="d:"]');
  await expect(draftNode).toContainText("reviews");
  // Adding a table pans to it; bring every table back into view before drawing a line.
  await page.getByRole("button", { name: "Fit everything in view" }).click();
  // Drawn backwards on purpose: from the target column to the new one works too.
  await node(page, "t:products")
    .locator('.react-flow__handle[data-handleid="R:id"]')
    .dragTo(draftNode.locator('.react-flow__handle[data-handleid="L:product_id"]'));
  await expect(edges(page)).toHaveCount(4);
  await expect(page.locator(".react-flow__edge.is-draft")).toHaveCount(1);

  // Columns of different types can't be linked: orders.status is TEXT, customers.id INTEGER.
  await node(page, "t:orders")
    .locator('.react-flow__handle[data-handleid="R:status"]')
    .dragTo(node(page, "t:customers").locator('.react-flow__handle[data-handleid="L:id"]'));
  await expect(page.getByText(/linked columns need the same type/)).toBeVisible();
  await expect(edges(page)).toHaveCount(4);

  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 300 } });
  await expect(unsavedBadge(page)).toBeVisible();
  await page.getByRole("button", { name: "Save options" }).click();
  await expect(page.getByRole("menu")).toContainText("1 new table");
  await page.getByRole("menuitem", { name: /Review and save to Sample shop/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText('CREATE TABLE "reviews"');
  // The new column took the type of the column it points at.
  await expect(dialog).toContainText('"product_id" INTEGER REFERENCES "products"("id")');
  await dialog.getByRole("button", { name: "Save to database" }).click();

  await expect(node(page, "t:reviews")).toBeVisible();
  await expect(unsavedBadge(page)).toHaveCount(0);
  await expect(page.locator(".react-flow__edge.is-draft")).toHaveCount(0);
  await expect(edges(page)).toHaveCount(4);
});

test("shows the schema as saved, read-only, and comes back to the design", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);
  await page.getByRole("button", { name: "Add table" }).first().click();
  const draftNode = page.locator('.react-flow__node[data-id^="d:"]');
  await expect(draftNode).toBeVisible();

  const asSaved = page.getByRole("button", { name: "Show the schema as saved" });
  await asSaved.click();
  await expect(asSaved).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("without your changes");
  await expect(draftNode).toHaveCount(0);
  await expect(node(page, "t:customers")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add table" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back to your design" }).click();
  await expect(draftNode).toBeVisible();
  await expect(unsavedBadge(page)).toBeVisible();
});

test("turns a blank design into a new database", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);
  await switchTo(page, "Blank design");
  await expect(page.getByText("Nothing to draw yet")).toBeVisible();

  await page.getByRole("button", { name: "Add table" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("notes");
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 300 } });
  await unsavedBadge(page).click();
  await page.getByLabel("Database name").fill("Designed");
  await page.getByRole("button", { name: "Create database" }).click();

  await expect(switcher(page)).toHaveAccessibleName("Database: Designed");
  await expect(node(page, "t:notes")).toBeVisible();
});

test("tables keep their own colors: presets, custom, and through apply", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);
  const outline = page.getByRole("navigation", { name: "Tables and columns" });
  const header = (id: string) => node(page, id).locator(":scope > div > div").first();

  // Preset from the dot in the outline.
  await outline.getByRole("button", { name: /^Color for customers/ }).click();
  await page
    .getByRole("radiogroup", { name: "Color for customers" })
    .getByRole("radio", { name: "Mint" })
    .click();
  await page.keyboard.press("Escape");
  await expect(outline.getByRole("button", { name: "Color for customers: Mint" })).toBeVisible();
  await expect(header("t:customers")).toHaveCSS("box-shadow", /inset/);

  // Custom color from the details panel.
  await node(page, "t:orders").click();
  const details = page.getByRole("complementary", { name: "Details" });
  await details.getByRole("radio", { name: "Custom color" }).fill("#ff8800");
  await expect(outline.getByRole("button", { name: "Color for orders: #FF8800" })).toBeVisible();
  await expect(header("t:orders")).toHaveCSS("box-shadow", /rgb\(255, 136, 0\)/);

  // A new table keeps its color once applied.
  await page.getByRole("button", { name: "Add table" }).first().click();
  await details.getByRole("radio", { name: "Rose" }).click();
  await saveToDatabase(page);
  await expect(node(page, "t:table_1")).toBeVisible();
  await expect(outline.getByRole("button", { name: "Color for table_1: Rose" })).toBeVisible();

  await page.reload();
  await expect(outline.getByRole("button", { name: "Color for customers: Mint" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(outline.getByRole("button", { name: "Color for orders: #FF8800" })).toBeVisible();
  await expect(outline.getByRole("button", { name: "Color for table_1: Rose" })).toBeVisible();
});

test("saves a design as a new database and leaves the original untouched", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);
  await page.getByRole("button", { name: "Add table" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("wishlist");

  await page.getByRole("button", { name: "Save options" }).click();
  await page.getByRole("menuitem", { name: /Save as a new database/ }).click();
  await page.getByLabel("Database name").fill("Shop v2");
  await page.getByRole("button", { name: "Create database" }).click();

  // The new database has the whole schema plus the new table, with empty tables.
  await expect(switcher(page)).toHaveAccessibleName("Database: Shop v2");
  await expect(node(page, "t:wishlist")).toBeVisible();
  await expect(edges(page)).toHaveCount(3);
  await node(page, "t:customers").click();
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText("0 rows");

  // The original still has its rows and no new table, and its draft is gone.
  await switchTo(page, "Sample shop");
  await expect(node(page, "t:customers")).toBeVisible();
  await expect(node(page, "t:wishlist")).toHaveCount(0);
  await expect(unsavedBadge(page)).toHaveCount(0);
  await node(page, "t:customers").click();
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText("60 rows");
});

test("the same databases on both pages; unsaved designs stay drafts until saved", async ({
  page,
}) => {
  await createSample(page);
  await openVisualizer(page);
  const unsaved = unsavedBadge(page);
  await page.getByRole("button", { name: "Add table" }).first().click();
  await expect(unsaved).toBeVisible();

  // A database created from the schema page's menu is a real one, listed everywhere.
  await switcher(page).click();
  await page.getByRole("menuitem", { name: "New empty database" }).click();
  const newDb = page.getByRole("dialog");
  await newDb.getByLabel("Name").fill("Other");
  await newDb.getByRole("button", { name: "Create" }).click();
  await expect(switcher(page)).toHaveAccessibleName("Database: Other");
  await expect(page.getByText("Nothing to draw yet")).toBeVisible();

  // Sample shop's design was kept as a draft and is marked in the menu.
  await switcher(page).click();
  await expect(page.getByRole("menuitem", { name: /^Sample shop/ })).toContainText("draft");
  await page.getByRole("menuitem", { name: /^Sample shop/ }).click();
  await expect(unsaved).toBeVisible();

  // Leaving with unsaved changes asks first; discarding leaves the database as it was.
  await switchTo(page, "Other");
  const guard = page.getByRole("alertdialog");
  await expect(guard).toContainText("hasn't been saved to Sample shop");
  await guard.getByRole("button", { name: "Discard changes" }).click();
  await expect(switcher(page)).toHaveAccessibleName("Database: Other");
  await switchTo(page, "Sample shop");
  await expect(unsaved).toHaveCount(0);
  await expect(node(page, "t:table_1")).toHaveCount(0);

  // Keeping a draft and going to the editor: the editor's menu shows it too.
  await page.getByRole("button", { name: "Add table" }).first().click();
  await page.getByRole("button", { name: "Editor" }).click();
  await guard.getByRole("button", { name: "Keep as draft" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(switcher(page)).toHaveAccessibleName("Database: Sample shop", { timeout: 30_000 });
  await switcher(page).click();
  await expect(page.getByRole("menuitem", { name: /^Sample shop/ })).toContainText("draft");
  await expect(page.getByRole("menuitem", { name: /^Other/ })).toBeVisible();
});

test("edits existing tables and columns from the outline, then saves with the badge", async ({
  page,
}) => {
  await createSample(page);
  await openVisualizer(page);
  const outline = page.getByRole("navigation", { name: "Tables and columns" });
  const editor = page.locator('[data-slot="popover-content"]');
  await outline.getByRole("button", { name: "Expand all tables" }).click();

  // Rename a column.
  await outline.getByRole("button", { name: "Edit column city of customers" }).click();
  await editor.getByRole("textbox", { name: "Column name" }).fill("town");
  // A click on the canvas closes the editor (the canvas swallows pointer events).
  const pane = page.locator(".react-flow__pane");
  const box = (await pane.boundingBox())!;
  await pane.click({ position: { x: box.width - 40, y: 80 } });
  await expect(editor).toHaveCount(0);
  await expect(outline.getByRole("list", { name: "customers columns" })).toContainText("town");

  // Delete a column: it stays listed as deleted until saved, and can be restored.
  await outline.getByRole("button", { name: "Edit column note of orders" }).click();
  await editor.getByRole("button", { name: "Delete column note" }).click();
  await expect(editor.getByRole("button", { name: "Restore column" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(outline.getByLabel("Deleted when you save")).toHaveCount(1);

  // Rename a table and add a column from the table menu.
  await outline.getByRole("button", { name: "Actions for products" }).click();
  await page.getByRole("menuitem", { name: "Rename table" }).click();
  await outline.getByRole("textbox", { name: "New name for products" }).fill("items");
  await page.keyboard.press("Enter");
  await expect(node(page, "t:products")).toContainText("renamed from products");
  await outline.getByRole("button", { name: "Actions for orders" }).click();
  await page.getByRole("menuitem", { name: "Add column" }).click();
  await editor.getByRole("textbox", { name: "Column name" }).fill("channel");
  // Picking from a dropdown inside the editor keeps it open.
  await editor.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "INTEGER", exact: true }).click();
  await expect(editor.getByRole("combobox", { name: "Type" })).toHaveText("INTEGER");
  await page.keyboard.press("Escape");

  // Nothing is in the database yet. The badge asks before it changes the database; a
  // cancelled save leaves it alone.
  await unsavedBadge(page).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("changes Sample shop itself");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(unsavedBadge(page)).toBeVisible();
  await expect(node(page, "t:products")).toContainText("renamed from products");
  await unsavedBadge(page).click();
  await confirm.getByRole("button", { name: "Save to database" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(node(page, "t:items")).toBeVisible();

  // The same editor opens from a column on a table card.
  await node(page, "t:customers").getByRole("button", { name: "Edit column town" }).click();
  await expect(editor.getByRole("textbox", { name: "Column name" })).toHaveValue("town");
  await page.keyboard.press("Escape");
  const orders = outline.getByRole("list", { name: "orders columns" });
  await expect(orders).toContainText("channel");
  await expect(orders).not.toContainText("note");

  await page.reload();
  await outline.getByRole("button", { name: "Expand customers" }).click({ timeout: 30_000 });
  await expect(outline.getByRole("list", { name: "customers columns" })).toContainText("town");
  await expect(node(page, "t:items")).toBeVisible();
  await expect(unsavedBadge(page)).toHaveCount(0);
});

test("removing the open database moves to another one", async ({ page }) => {
  await createSample(page);
  await openVisualizer(page);
  await switcher(page).click();
  await page.getByRole("menuitem", { name: "New empty database" }).click();
  const newDb = page.getByRole("dialog");
  await newDb.getByLabel("Name").fill("Gone soon");
  await newDb.getByRole("button", { name: "Create" }).click();
  await expect(switcher(page)).toHaveAccessibleName("Database: Gone soon");

  await switcher(page).click();
  await page.getByRole("menuitem", { name: /^Delete/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  await expect(switcher(page)).toHaveAccessibleName("Database: Sample shop");
  await expect(node(page, "t:customers")).toBeVisible();
  await expect(page.getByText(/could not be opened/)).toHaveCount(0);
});
