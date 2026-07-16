import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("homepage exposes episode and work entry points", async ({ page }) => {
  // Given the built homepage
  await page.goto("/");

  // When a visitor reviews its discovery paths
  const headings = page.getByRole("heading", { level: 1 });

  // Then the page has one clear heading and two stable entry links
  await expect(headings).toHaveCount(1);
  await expect(headings).toContainText("下一部值得读或看的作品");
  await expect(
    page.getByRole("link", { name: "浏览全部节目" }),
  ).toHaveAttribute("href", "/episodes/");
  await expect(
    page.getByRole("link", { name: "浏览全部作品" }),
  ).toHaveAttribute("href", "/works/");
  await expect(
    page.getByRole("heading", { name: "近期推荐作品" }),
  ).toBeVisible();
  await expect(page.locator("[data-recent-episode]")).toHaveCount(3);
  const recentWorkLinks = page.locator("[data-recent-work] h2 a");
  await expect(recentWorkLinks).toHaveCount(6);
  const recentWorkHrefs = await recentWorkLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(new Set(recentWorkHrefs).size).toBe(6);
  await expect(page.getByText("最近入库")).toHaveCount(0);
});

test("collection pages expose only publishable records", async ({ page }) => {
  // Given the public collection routes
  await page.goto("/episodes/");

  // When their rendered records are inspected
  const episodeLinks = page.locator("[data-episode-card] h2 a");
  const episodeCount = await episodeLinks.count();
  const firstEpisodeHref = await episodeLinks.first().getAttribute("href");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.goto("/works/");
  const workLinks = page.locator("[data-work-card] h2 a");
  const workCount = await workLinks.count();
  const firstWorkHref = await workLinks.first().getAttribute("href");

  // Then public records exist, use stable trailing-slash links, and expose no candidates
  expect(episodeCount).toBeGreaterThan(0);
  expect(firstEpisodeHref).toMatch(/^\/episodes\/[^/]+\/$/u);
  expect(workCount).toBeGreaterThan(0);
  expect(firstWorkHref).toMatch(/^\/works\/[^/]+\/$/u);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "书籍" })).toHaveAttribute(
    "value",
    "book",
  );
  await expect(page.getByRole("option", { name: "电影" })).toHaveAttribute(
    "value",
    "film",
  );
  await expect(page.getByRole("option", { name: "部分核验" })).toHaveAttribute(
    "value",
    "partially_verified",
  );
  await expect(
    page.locator('[data-work-card][data-media="film"]').first(),
  ).toContainText("电影");
  await expect(page.locator("[data-work-card]").first()).toContainText(
    "部分核验",
  );
  await expect(
    page.locator('[data-verification-status="pending_verification"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-publication-status="withheld"]'),
  ).toHaveCount(0);
});

test("media filter updates visible works and shareable URL", async ({
  page,
}) => {
  // Given the complete works index
  await page.goto("/works/");
  const initialCount = await page.locator("[data-work-card]:visible").count();

  // When a visitor selects films
  await page.getByLabel("媒介类型").selectOption("film");

  // Then only films remain visible and the URL records the selection
  await expect(page).toHaveURL(/\/works\/\?media=film$/u);
  const visibleCards = page.locator("[data-work-card]:visible");
  expect(await visibleCards.count()).toBeGreaterThan(0);
  expect(await visibleCards.count()).toBeLessThan(initialCount);
  expect(
    await visibleCards.evaluateAll((cards) =>
      cards.every((card) => card.getAttribute("data-media") === "film"),
    ),
  ).toBe(true);
});

test("shareable query restores both filters", async ({ page }) => {
  // Given a shared works URL
  await page.goto("/works/?media=book&status=partially_verified");

  // When the filter UI initializes
  const visibleCards = page.locator("[data-work-card]:visible");

  // Then its controls and results reflect both parameters
  await expect(page.getByLabel("媒介类型")).toHaveValue("book");
  await expect(page.getByLabel("核验状态")).toHaveValue("partially_verified");
  expect(await visibleCards.count()).toBeGreaterThan(0);
  expect(
    await visibleCards.evaluateAll((cards) =>
      cards.every(
        (card) =>
          card.getAttribute("data-media") === "book" &&
          card.getAttribute("data-verification-status") ===
            "partially_verified",
      ),
    ),
  ).toBe(true);
});

test("reset restores the complete work collection", async ({ page }) => {
  // Given a filtered works index
  await page.goto("/works/?media=film");
  const filteredCount = await page.locator("[data-work-card]:visible").count();

  // When the visitor resets the form
  await page.getByRole("button", { name: "重置筛选" }).click();

  // Then all works return and the query is removed
  await expect(page).toHaveURL(/\/works\/$/u);
  await expect(page.getByLabel("媒介类型")).toHaveValue("");
  const restoredCount = await page.locator("[data-work-card]:visible").count();
  expect(restoredCount).toBeGreaterThan(filteredCount);
});

test("empty filter result explains how to recover", async ({ page }) => {
  // Given the works index
  await page.goto("/works/");

  // When a public collection has no rejected works
  await page.getByLabel("核验状态").selectOption("rejected");

  // Then no card is shown and a resettable empty state appears
  await expect(page.locator("[data-work-card]:visible")).toHaveCount(0);
  await expect(page.locator("[data-filter-empty]")).toContainText(
    "没有符合当前筛选条件的作品",
  );
  await expect(
    page.locator("[data-filter-empty]").getByRole("button", {
      name: "清除筛选",
    }),
  ).toBeVisible();
});

test("empty filter result has no serious accessibility violations", async ({
  page,
}) => {
  await page.goto("/works/");

  await page.getByLabel("核验状态").selectOption("rejected");

  const seriousViolations = (
    await new AxeBuilder({ page })
      .include("[data-work-list], [data-filter-empty]")
      .analyze()
  ).violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(seriousViolations).toEqual([]);
});

test("filter controls preserve keyboard focus order", async ({ page }) => {
  // Given the works index at the configured desktop or mobile viewport
  await page.goto("/works/");
  const mediaFilter = page.getByLabel("媒介类型");
  const statusFilter = page.getByLabel("核验状态");

  // When keyboard focus advances from the media control
  await mediaFilter.focus();
  await mediaFilter.press("Tab");

  // Then the next filter receives visible focus
  await expect(statusFilter).toBeFocused();
  await expect(statusFilter).toHaveCSS("outline-style", "solid");
});

test("works remain available without JavaScript", async ({ browser }) => {
  // Given a browser context with scripts disabled
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  // When the visitor opens the static works page
  await page.goto("/works/");

  // Then the full server-rendered collection remains readable
  expect(await page.locator("[data-work-card]").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-filter-empty]")).toBeHidden();
  await context.close();
});
