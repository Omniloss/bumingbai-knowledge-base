import { expect, test } from "@playwright/test";

test("search reaches a work from Chinese text", async ({ page }) => {
  // Given
  await page.goto("/");
  const search = page.getByRole("searchbox", {
    name: "搜索节目、人物和作品",
  });

  // When
  await search.fill("记忆");

  // Then
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("search supports keyboard selection and Escape", async ({ page }) => {
  // Given
  await page.goto("/");
  const search = page.getByRole("searchbox", {
    name: "搜索节目、人物和作品",
  });
  await search.fill("记忆");
  await expect(page.getByRole("option").first()).toBeVisible();

  // When
  await search.press("ArrowDown");

  // Then
  await expect(search).toHaveAttribute(
    "aria-activedescendant",
    /search-result-/,
  );

  // When
  await search.press("Escape");

  // Then
  await expect(search).toHaveValue("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
