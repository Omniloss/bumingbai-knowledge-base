import { expect, test } from "@playwright/test";

test("methodology omits nonpublic review states", async ({ page }) => {
  await page.goto("/about/methodology/");

  await expect(page.getByRole("main")).not.toContainText("待核验");
  await expect(page.getByRole("main")).not.toContainText("已排除");
  await expect(page.getByRole("main")).not.toContainText("审核记录");
});
