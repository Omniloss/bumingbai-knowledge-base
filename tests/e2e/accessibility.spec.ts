import { expect, test } from "@playwright/test";

const PUBLIC_MEDIA_LABELS = new Map([
  ["book", "书籍"],
  ["film", "电影"],
  ["documentary", "纪录片"],
  ["television", "电视剧"],
  ["podcast", "播客"],
  ["other", "其他"],
]);
const PUBLIC_STATUS_LABELS = new Map([
  ["verified", "已核验"],
  ["partially_verified", "部分核验"],
]);

test("public filters expose only values that can match the collection", async ({
  page,
}) => {
  await page.goto("/works/");

  const mediaOptions = await page
    .getByLabel("媒介类型")
    .getByRole("option")
    .evaluateAll((options) =>
      options.map((option) => ({
        label: option.textContent?.trim() ?? "",
        value: option.getAttribute("value") ?? "",
      })),
    );
  const publicMediaValues = await page
    .locator("[data-work-card]")
    .evaluateAll((cards) =>
      [...new Set(cards.map((card) => card.getAttribute("data-media")))].filter(
        (value) => value !== null,
      ),
    );
  const statusOptions = await page
    .getByLabel("核验状态")
    .getByRole("option")
    .evaluateAll((options) =>
      options.map((option) => ({
        label: option.textContent?.trim() ?? "",
        value: option.getAttribute("value") ?? "",
      })),
    );
  const publicStatusValues = await page
    .locator("[data-work-card]")
    .evaluateAll((cards) =>
      [
        ...new Set(
          cards.map((card) => card.getAttribute("data-verification-status")),
        ),
      ].filter((value) => value !== null),
    );

  expect(mediaOptions[0]).toEqual({ label: "全部媒介", value: "" });
  expect(statusOptions[0]).toEqual({ label: "全部状态", value: "" });
  expect(new Set(mediaOptions.slice(1).map(({ value }) => value))).toEqual(
    new Set(publicMediaValues),
  );
  expect(new Set(statusOptions.slice(1).map(({ value }) => value))).toEqual(
    new Set(publicStatusValues),
  );
  for (const option of mediaOptions.slice(1)) {
    expect(PUBLIC_MEDIA_LABELS.get(option.value)).toBe(option.label);
  }
  for (const option of statusOptions.slice(1)) {
    expect(PUBLIC_STATUS_LABELS.get(option.value)).toBe(option.label);
  }
  expect(statusOptions.map(({ value }) => value)).not.toContain(
    "pending_verification",
  );
  expect(statusOptions.map(({ value }) => value)).not.toContain("rejected");
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
  {
    expectedColumns: 1,
    expectedFilterDirection: "column",
    height: 900,
    width: 639,
  },
  {
    expectedColumns: 2,
    expectedFilterDirection: "row",
    height: 900,
    width: 640,
  },
  {
    expectedColumns: 2,
    expectedFilterDirection: "row",
    height: 900,
    width: 959,
  },
  {
    expectedColumns: 3,
    expectedFilterDirection: "row",
    height: 900,
    width: 960,
  },
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
    await expect(page.locator("[data-works-filter]")).toHaveCSS(
      "flex-direction",
      viewport.expectedFilterDirection,
    );
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
