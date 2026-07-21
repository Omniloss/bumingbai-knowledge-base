import { expect, test } from "@playwright/test";

const { PUBLIC_REPOSITORY_URL, PUBLIC_SITE_URL } = process.env;

if (!PUBLIC_REPOSITORY_URL || !PUBLIC_SITE_URL) {
  throw new Error(
    "PUBLIC_REPOSITORY_URL and PUBLIC_SITE_URL are required for deployment smoke tests",
  );
}

test("credits include required provider attribution", async ({ page }) => {
  await page.goto("/about/credits/");

  await expect(
    page.getByText(
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Open Library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Open Library" }),
  ).toHaveCSS("white-space", "nowrap");
  await expect(
    page.getByAltText("The Movie Database (TMDB) logo"),
  ).toHaveAttribute("src", "/vendor/tmdb-logo.svg");
  await expect
    .poll(() =>
      page
        .getByAltText("The Movie Database (TMDB) logo")
        .evaluate((image) =>
          image instanceof HTMLImageElement ? image.naturalWidth : 0,
        ),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("link", { name: "Wikimedia Commons" }),
  ).toBeVisible();
});

test("work detail opens a minimally prefilled correction issue", async ({
  page,
}) => {
  await page.goto("/works/");
  await page.locator("[data-work-card] h2 a").first().click();

  const workTitle = await page.getByRole("heading", { level: 1 }).textContent();
  const link = page.getByRole("link", { name: "报告资料错误" });
  const href = await link.getAttribute("href");

  expect(href).not.toBeNull();
  if (href === null) throw new Error("correction link has no href");
  const issueUrl = new URL(href);
  expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(
    new URL("issues/new", `${PUBLIC_REPOSITORY_URL}/`).toString(),
  );
  expect([...issueUrl.searchParams.keys()].toSorted()).toEqual([
    "body",
    "title",
  ]);
  expect(issueUrl.searchParams.get("title")).toBe(`[资料纠错] ${workTitle}`);
  const body = issueUrl.searchParams.get("body");
  expect(body).toMatch(/^实体 ID: work_/u);
  expect(body).toContain(`\n页面: ${PUBLIC_SITE_URL}/works/`);
  expect(body).toMatch(/\/\n\n请说明错误及可靠来源：$/u);
});

test("public episode and person details expose scoped correction links", async ({
  page,
}) => {
  const entities = [
    { idPrefix: "episode_", path: "/episodes/ep-220/" },
    { idPrefix: "person_", path: "/people/袁莉-102966/" },
  ] as const;

  for (const entity of entities) {
    await page.goto(entity.path);
    const href = await page
      .getByRole("link", { name: "报告资料错误" })
      .getAttribute("href");
    if (href === null) throw new Error(`${entity.path} has no correction href`);
    const issueUrl = new URL(href);

    expect([...issueUrl.searchParams.keys()].toSorted()).toEqual([
      "body",
      "title",
    ]);
    const body = issueUrl.searchParams.get("body");
    expect(body?.startsWith(`实体 ID: ${entity.idPrefix}`)).toBe(true);
    const expectedPageUrl = new URL(entity.path, `${PUBLIC_SITE_URL}/`);
    expect(body).toContain(
      `\n页面: ${expectedPageUrl.toString()}\n\n请说明错误及可靠来源：`,
    );
  }
});

test("film detail separates status from its correction action", async ({
  page,
}) => {
  await page.goto("/works/惊爆十三天-53a333/");

  const status = await page
    .locator(".work-detail-header .status-badge")
    .boundingBox();
  const action = await page
    .locator(".work-detail-header .detail-actions")
    .boundingBox();

  expect(status).not.toBeNull();
  expect(action).not.toBeNull();
  if (status === null || action === null) {
    throw new Error("film status or correction action is not rendered");
  }
  expect(action.y - (status.y + status.height)).toBeGreaterThanOrEqual(16);
});

test("correction guide explains the public issue workflow", async ({
  page,
}) => {
  await page.goto("/report-error/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "报告资料错误",
  );
  await expect(page.getByRole("main")).toContainText("GitHub Issue");
});

test("expanded navigation wraps without mobile overflow", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 320 });

  for (const route of ["/episodes/", "/works/"] as const) {
    await page.goto(route);

    const layout = await page.locator(".site-header").evaluate((header) => {
      const viewportWidth = document.documentElement.clientWidth;
      const links = [...header.querySelectorAll("nav a")].map((link) => {
        const box = link.getBoundingClientRect();
        return { left: box.left, right: box.right };
      });

      return {
        documentFits:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
        linksFit: links.every(
          ({ left, right }) => left >= 0 && right <= viewportWidth,
        ),
      };
    });

    expect(layout).toEqual({ documentFits: true, linksFit: true });
  }
});
