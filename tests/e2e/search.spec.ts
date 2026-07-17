import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("search reaches a work from Chinese text", async ({ page }) => {
  // Given
  await page.goto("/");
  const search = page.getByRole("combobox", {
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
  const search = page.getByRole("combobox", {
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
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("search waits for two characters, groups records, and supports ArrowUp and Enter", async ({
  page,
}) => {
  // Given
  let requestCount = 0;
  await page.route("**/search-index.json", async (route) => {
    requestCount += 1;
    await route.fulfill({
      body: JSON.stringify([
        {
          aliases: [],
          id: "episode-1",
          kind: "episode",
          title: "记忆节目",
          tokens: ["记忆"],
          url: "/episodes/episode-1/",
        },
        {
          aliases: ["记忆别名"],
          id: "work-1",
          kind: "work",
          title: "作品",
          tokens: ["记忆"],
          url: "/works/work-1/",
        },
      ]),
      contentType: "application/json",
    });
  });
  await page.goto("/");
  const search = page.getByRole("combobox", {
    name: "搜索节目、人物和作品",
  });

  // When
  await search.fill("记");

  // Then
  expect(requestCount).toBe(0);

  // When
  const secondCharacterRequest = page.waitForRequest("**/search-index.json");
  await search.fill("记忆");
  await secondCharacterRequest;

  // Then
  expect(requestCount).toBe(1);
  await expect(
    page.locator(".search-result-group h3", { hasText: "节目" }),
  ).toBeVisible();
  await expect(
    page.locator(".search-result-group h3", { hasText: "作品" }),
  ).toBeVisible();

  // When
  await search.press("ArrowUp");

  // Then
  await expect(search).toHaveAttribute(
    "aria-activedescendant",
    "search-result-1",
  );

  // When
  await search.press("Enter");

  // Then
  await expect(page).toHaveURL(/\/works\/work-1\/$/);
});

test("search exposes an honest unavailable state when the index cannot load", async ({
  page,
}) => {
  // Given
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.route("**/search-index.json", async (route) => {
    await route.fulfill({ status: 500 });
  });
  await page.goto("/");
  const search = page.getByRole("combobox", {
    name: "搜索节目、人物和作品",
  });

  // When
  await search.fill("记忆");

  // Then
  await expect(page.getByText("搜索暂不可用，请稍后重试。")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("search retries after an initial index failure without reloading", async ({
  page,
}) => {
  // Given
  let requestCount = 0;
  let serveIndex = false;
  await page.route("**/search-index.json", async (route) => {
    requestCount += 1;
    if (!serveIndex) {
      await route.fulfill({ status: 500 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify([
        {
          aliases: [],
          id: "retry-work",
          kind: "work",
          title: "记忆重试作品",
          tokens: ["记忆", "重试"],
          url: "/works/retry-work/",
        },
      ]),
      contentType: "application/json",
    });
  });
  await page.goto("/");
  const search = page.getByRole("combobox", {
    name: "搜索节目、人物和作品",
  });

  // When
  await search.fill("记忆");

  // Then
  await expect(page.getByText("搜索暂不可用，请稍后重试。")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  expect(requestCount).toBeGreaterThanOrEqual(2);
  const failedRequestCount = requestCount;

  // When
  serveIndex = true;
  await search.fill("记忆重试");

  // Then
  await expect.poll(() => requestCount).toBeGreaterThan(failedRequestCount);
  await expect(
    page.getByRole("option").filter({ hasText: "记忆重试作品" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("search results have no serious or critical axe violations", async ({
  page,
}) => {
  // Given
  await page.goto("/");
  const search = page.getByRole("combobox", {
    name: "搜索节目、人物和作品",
  });

  // When
  await search.fill("记忆");
  await page.getByRole("listbox").waitFor();
  const results = await new AxeBuilder({ page })
    .include("#catalog-search")
    .include("#catalog-search-results")
    .analyze();

  // Then
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});
