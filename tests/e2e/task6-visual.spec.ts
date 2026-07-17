import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test } from "@playwright/test";

type VisualState = {
  readonly name: string;
  readonly open: (page: Page) => Promise<void>;
};

const OUTPUT_PATH = path.join(
  process.cwd(),
  ".superpowers",
  "sdd",
  "task6-evidence",
  "captures",
);
const { TASK6_CAPTURE } = process.env;
const BASE_VIEWPORTS = [
  { height: 900, name: "1440x900", width: 1_440 },
  { height: 844, name: "390x844", width: 390 },
] as const;
const CONTRACT_VIEWPORTS = [
  { height: 844, name: "375x844", width: 375 },
  { height: 900, name: "768x900", width: 768 },
  { height: 900, name: "1280x900", width: 1_280 },
] as const;
const states: readonly VisualState[] = [
  {
    name: "homepage-default",
    open: (page) => page.goto("/").then(() => undefined),
  },
  {
    name: "homepage-search-filled",
    open: async (page) => {
      await page.goto("/");
      await page
        .getByRole("combobox", { name: "搜索节目、人物和作品" })
        .fill("记忆");
      await page.getByRole("option").first().waitFor();
      await page.locator(".search-box").evaluate((element) => {
        element.scrollIntoView({ block: "start" });
      });
    },
  },
  {
    name: "homepage-search-error",
    open: async (page) => {
      await page.route("**/search-index.json", async (route) => {
        await route.fulfill({ status: 500 });
      });
      await page.goto("/");
      await page
        .getByRole("combobox", { name: "搜索节目、人物和作品" })
        .fill("记忆");
      await page.getByText("搜索暂不可用，请稍后重试。").waitFor();
      await page.locator(".search-box").evaluate((element) => {
        element.scrollIntoView({ block: "start" });
      });
    },
  },
  {
    name: "episode-index",
    open: (page) => page.goto("/episodes/").then(() => undefined),
  },
  {
    name: "works-default",
    open: (page) => page.goto("/works/").then(() => undefined),
  },
  {
    name: "works-filtered",
    open: async (page) => {
      await page.goto("/works/");
      await page.getByLabel("媒介类型").selectOption("film");
    },
  },
  {
    name: "works-empty",
    open: async (page) => {
      await page.goto("/works/");
      await page.locator("[data-work-card]").evaluateAll((cards) => {
        for (const card of cards) card.setAttribute("data-media", "other");
      });
      await page.getByLabel("媒介类型").selectOption("book");
    },
  },
  {
    name: "methodology",
    open: (page) => page.goto("/about/methodology/").then(() => undefined),
  },
  {
    name: "episode-detail",
    open: (page) => page.goto("/episodes/ep-220/").then(() => undefined),
  },
  {
    name: "episode-non-https",
    open: (page) => page.goto("/episodes/ep-110/").then(() => undefined),
  },
  {
    name: "book-detail",
    open: (page) =>
      page.goto("/works/经济发展理论-6d5b7b/").then(() => undefined),
  },
  {
    name: "film-detail",
    open: (page) =>
      page.goto("/works/惊爆十三天-53a333/").then(() => undefined),
  },
  {
    name: "person-public",
    open: (page) => page.goto("/people/袁莉-102966/").then(() => undefined),
  },
];

test("capture every Task 6 template and state from the production build", async ({
  page,
}, testInfo) => {
  test.skip(TASK6_CAPTURE !== "1", "capture run is explicit");
  test.skip(testInfo.project.name !== "desktop", "one explicit capture matrix");
  await mkdir(OUTPUT_PATH, { recursive: true });

  for (const viewport of BASE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const state of states) {
      await page.unrouteAll({ behavior: "wait" });
      await state.open(page);
      await page.screenshot({
        animations: "disabled",
        path: path.join(OUTPUT_PATH, `${state.name}-${viewport.name}.png`),
      });
    }
  }

  for (const viewport of CONTRACT_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const state of states.filter(({ name }) =>
      ["homepage-default", "works-default"].includes(name),
    )) {
      await page.unrouteAll({ behavior: "wait" });
      await state.open(page);
      await page.screenshot({
        animations: "disabled",
        path: path.join(OUTPUT_PATH, `${state.name}-${viewport.name}.png`),
      });
    }
  }
});
