import { expect, test } from "@playwright/test";

test("methodology omits nonpublic review states", async ({ page }) => {
  await page.goto("/about/methodology/");

  await expect(page.getByRole("main")).not.toContainText("待核验");
  await expect(page.getByRole("main")).not.toContainText("已排除");
  await expect(page.getByRole("main")).not.toContainText("审核记录");
});

test("person page contains only public participation, creation, and recommendation sections", async ({
  page,
}) => {
  // Given
  await page.goto("/people/袁莉-102966/");

  // When
  const main = page.getByRole("main");

  // Then
  await expect(main.getByRole("heading", { name: "参与节目" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "创作作品" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "推荐作品" })).toBeVisible();
  await expect(main).not.toContainText("待核验");
  await expect(main).not.toContainText("已排除");
});
