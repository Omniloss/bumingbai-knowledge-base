import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { height: 900, name: "desktop", width: 1_440 },
  { height: 844, name: "mobile", width: 390 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} keyboard journey reaches evidence-first work detail`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "viewport is set explicitly",
    );
    await page.setViewportSize(viewport);
    await page.goto("/");

    const search = page.getByRole("combobox", {
      name: "搜索节目、人物和作品",
    });
    await search.fill("记忆");
    const episodeOption = page
      .getByRole("group", { name: "节目" })
      .getByRole("option")
      .first();
    await episodeOption.focus();
    await episodeOption.press("Enter");

    await expect(page).toHaveURL(/\/episodes\/[^/]+\/$/u);
    const workLink = page.locator("[data-work-card] a").first();
    await workLink.focus();
    await workLink.press("Enter");
    await expect(page).toHaveURL(/\/works\/[^/]+\/$/u);

    const sectionOrders = await page
      .locator("[data-section-order]")
      .evaluateAll((sections) =>
        sections.map((section) =>
          Number(section.getAttribute("data-section-order")),
        ),
      );
    expect(sectionOrders).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sectionOrders.indexOf(1)).toBeLessThan(sectionOrders.indexOf(2));
    expect(sectionOrders.indexOf(1)).toBeLessThan(sectionOrders.indexOf(3));
  });

  test(`${viewport.name} remains readable and stable with image requests blocked`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "viewport is set explicitly",
    );
    await page.setViewportSize(viewport);
    const blockedImageRequests: string[] = [];
    await page.route(
      /\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/u,
      async (route) => {
        blockedImageRequests.push(route.request().url());
        await route.abort();
      },
    );
    await page.goto("/works/经济发展理论-6d5b7b/", {
      waitUntil: "networkidle",
    });

    const main = page.getByRole("main");
    const fallback = page.getByText("暂无已核验图片");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(fallback).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    const initialBox = await main.boundingBox();
    const initialFallbackBox = await fallback.boundingBox();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const settledBox = await main.boundingBox();
    const settledFallbackBox = await fallback.boundingBox();

    expect(settledBox).toEqual(initialBox);
    expect(settledFallbackBox).toEqual(initialFallbackBox);
    expect(blockedImageRequests).toEqual([]);
    const badgeSignals = await page
      .locator(".status-badge")
      .evaluateAll((badges) =>
        badges.map((badge) => ({
          color: getComputedStyle(badge).color,
          text: badge.textContent?.trim() ?? "",
        })),
      );
    expect(badgeSignals.length).toBeGreaterThan(0);
    expect(badgeSignals.every((signal) => signal.text.length > 0)).toBe(true);
    expect(badgeSignals.every((signal) => signal.color.length > 0)).toBe(true);
  });
}
