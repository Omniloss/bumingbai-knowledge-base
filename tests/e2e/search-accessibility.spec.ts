import { expect, test } from "@playwright/test";
import { expectAccessiblePage } from "./accessibility-helpers";

test("homepage search default, filled, and error states preserve listbox semantics", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("combobox", {
    name: "搜索节目、人物和作品",
  });
  const results = page.getByRole("listbox", { name: "搜索结果" });

  await expect(search).toBeVisible();
  await expect(results).toBeAttached();
  await expect(search).toHaveAttribute(
    "aria-controls",
    "catalog-search-results",
  );

  await search.fill("记忆");
  await expect(results.getByRole("option").first()).toBeVisible();
  await expectAccessiblePage(page);

  await page.route("**/search-index.json", async (route) => {
    await route.fulfill({ status: 500 });
  });
  await page.reload();
  await page
    .getByRole("combobox", { name: "搜索节目、人物和作品" })
    .fill("记忆");
  await expect(page.getByText("搜索暂不可用，请稍后重试。")).toBeVisible();
  await expectAccessiblePage(page);
});
