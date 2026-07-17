import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const BOOK_PATH = "/works/经济发展理论-6d5b7b/";
const EPISODE_PATH = "/episodes/ep-220/";
const FILM_PATH = "/works/惊爆十三天-53a333/";
const PERSON_PATH = "/people/袁莉-102966/";
const NON_HTTPS_EPISODE_PATH = "/episodes/ep-110/";
const templateRoutes = [
  "/",
  "/episodes/",
  "/works/",
  "/about/methodology/",
  EPISODE_PATH,
  NON_HTTPS_EPISODE_PATH,
  BOOK_PATH,
  FILM_PATH,
  PERSON_PATH,
] as const;

async function listHtmlFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listHtmlFiles(entryPath)
        : entry.name.endsWith(".html")
          ? [entryPath]
          : [];
    }),
  );
  return nestedFiles.flat();
}

async function expectAccessiblePage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(violations).toEqual([]);
}

for (const route of templateRoutes) {
  test(`${route} keeps its template accessible and error-free`, async ({
    page,
  }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.goto(route);

    await expectAccessiblePage(page);
    const topLevelSectionHeadingLevels = await page
      .locator("main > section")
      .evaluateAll((sections) =>
        sections.map(
          (section) => section.querySelector("h1, h2")?.tagName ?? "",
        ),
      );
    expect(topLevelSectionHeadingLevels).not.toContain("");
    expect(runtimeErrors).toEqual([]);
  });
}

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

test("public filters expose only values that can match the collection", async ({
  page,
}) => {
  await page.goto("/works/");

  await expect(page.getByLabel("媒介类型").getByRole("option")).toHaveText([
    "全部媒介",
    "书籍",
    "电影",
    "纪录片",
    "播客",
    "其他",
  ]);
  await expect(page.getByLabel("核验状态").getByRole("option")).toHaveText([
    "全部状态",
    "部分核验",
  ]);
  const renderedMediaValues = await page
    .getByLabel("媒介类型")
    .getByRole("option")
    .evaluateAll((options) =>
      options.slice(1).map((option) => option.getAttribute("value")),
    );
  const publicMediaValues = await page
    .locator("[data-work-card]")
    .evaluateAll((cards) => [
      ...new Set(cards.map((card) => card.getAttribute("data-media"))),
    ]);
  const renderedStatusValues = await page
    .getByLabel("核验状态")
    .getByRole("option")
    .evaluateAll((options) =>
      options.slice(1).map((option) => option.getAttribute("value")),
    );
  const publicStatusValues = await page
    .locator("[data-work-card]")
    .evaluateAll((cards) => [
      ...new Set(
        cards.map((card) => card.getAttribute("data-verification-status")),
      ),
    ]);
  expect(new Set(renderedMediaValues)).toEqual(new Set(publicMediaValues));
  expect(new Set(renderedStatusValues)).toEqual(new Set(publicStatusValues));
  expect(renderedStatusValues).not.toContain("pending_verification");
  expect(renderedStatusValues).not.toContain("rejected");
  await expect(page.getByRole("main")).not.toContainText("待核验");
  await expect(page.getByRole("main")).not.toContainText("已排除");
});

test("filter order and empty recovery remain complete and keyboard-visible", async ({
  page,
}) => {
  await page.goto("/works/");
  const media = page.getByLabel("媒介类型");
  const status = page.getByLabel("核验状态");
  const reset = page.getByRole("button", { name: "重置筛选" });
  const initialCount = await page.locator("[data-work-card]:visible").count();

  await media.focus();
  await media.press("Tab");
  await expect(status).toBeFocused();
  await status.press("Tab");
  await expect(reset).toBeFocused();
  await expect(reset).toHaveCSS("outline-style", "solid");

  await page.locator("[data-work-card]").evaluateAll((cards) => {
    for (const card of cards) card.setAttribute("data-media", "other");
  });
  await media.selectOption("book");
  await expect(page.locator("[data-filter-empty]")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();

  await expect(page).toHaveURL(/\/works\/$/u);
  await expect(media).toHaveValue("");
  await expect(status).toHaveValue("");
  await expect(page.locator("[data-work-card]:visible")).toHaveCount(
    initialCount,
  );
  await expect(media).toBeFocused();
});

for (const viewport of [
  { expectedColumns: 3, height: 900, width: 1280 },
  { expectedColumns: 2, height: 900, width: 768 },
  { expectedColumns: 1, height: 844, width: 390 },
] as const) {
  test(`record grid uses exactly ${viewport.expectedColumns} columns at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/works/");
    const columns = await page
      .locator("[data-work-list]")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      );
    expect(columns).toBe(viewport.expectedColumns);
  });
}

test("mobile filters stay visible, stacked, and operable without a drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/works/");
  const form = page.locator("[data-works-filter]");
  const media = page.getByLabel("媒介类型");
  const status = page.getByLabel("核验状态");

  await expect(form).toBeVisible();
  await expect(media).toBeVisible();
  await expect(status).toBeVisible();
  await expect(page.getByRole("button", { name: "重置筛选" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /打开|关闭.*筛选/u }),
  ).toHaveCount(0);
  expect(
    await form.evaluate((node) => {
      const select = node.querySelector("#media-filter");
      return select instanceof HTMLSelectElement
        ? select.getBoundingClientRect().width ===
            node.getBoundingClientRect().width
        : false;
    }),
  ).toBe(true);
});

test("all generated pages keep one h1 and no unsafe or nonpublic markup", async ({
  browserName: _browserName,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "one build-level pass is sufficient",
  );
  const distPath = path.join(process.cwd(), "dist");
  const files = await listHtmlFiles(distPath);
  const topicFiles = files.filter((file) =>
    file.includes(`${path.sep}topics${path.sep}`),
  );

  expect(files).toHaveLength(1_238);
  expect(topicFiles).toHaveLength(0);
  for (const file of files) {
    const html = await readFile(file, "utf8");
    expect(html.match(/<h1(?:\s|>)/gu) ?? [], file).toHaveLength(1);
    expect(html, file).not.toMatch(/href=["']http:\/\//iu);
    expect(html, file).not.toContain('data-publication-status="withheld"');
    expect(html, file).not.toContain(
      'data-verification-status="pending_verification"',
    );
    expect(html, file).not.toContain('data-verification-status="rejected"');
  }
});
