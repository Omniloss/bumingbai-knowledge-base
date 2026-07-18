import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BOOK_PATH = "/works/经济发展理论-6d5b7b/";
const EPISODE_PATH = "/episodes/ep-220/";
const FILM_PATH = "/works/惊爆十三天-53a333/";
const detailRoutes = [BOOK_PATH, FILM_PATH, EPISODE_PATH] as const;
function countPhraseLines(element: Element, phrase: string): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const text = textNode.textContent ?? "";
    const start = text.indexOf(phrase);
    if (start >= 0) {
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + phrase.length);
      return range.getClientRects().length;
    }
    textNode = walker.nextNode();
  }
  return 0;
}
test("work detail preserves the six-section evidence-first order", async ({
  page,
}) => {
  await test.step("Given a public book detail page", () =>
    page.goto(BOOK_PATH));

  const orders =
    await test.step("When its editorial sections are inspected", () =>
      page
        .locator("[data-section-order]")
        .evaluateAll((nodes) =>
          nodes.map((node) => Number(node.getAttribute("data-section-order"))),
        ));

  await test.step("Then all six sections appear once and evidence precedes versions and relations", async () => {
    expect(orders).toEqual([0, 1, 2, 3, 4, 5]);
    expect(orders.indexOf(1)).toBeLessThan(orders.indexOf(2));
    expect(orders.indexOf(1)).toBeLessThan(orders.indexOf(3));
    await expect(
      page.getByRole("heading", { level: 2, name: "推荐出处" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "关联作品" }),
    ).toBeVisible();
  });
});

test("work evidence exposes only public official sources", async ({ page }) => {
  await test.step("Given a work with publishable recommendation evidence", () =>
    page.goto(BOOK_PATH));

  const panels = page.locator("[data-evidence-panel]");
  const sourceLinks = panels.getByRole("link", { name: "查看官方证据" });

  await test.step("Then every panel is public and every official link is safe", async () => {
    expect(await panels.count()).toBeGreaterThan(0);
    await expect(panels).toHaveAttribute(
      "data-evidence-publication-status",
      "public",
    );
    await expect(sourceLinks).toHaveAttribute("href", /^https:\/\//u);
    await expect(sourceLinks).toHaveAttribute("rel", "external noreferrer");
    await expect(panels.locator('a[href^="/episodes/"]')).toHaveAttribute(
      "href",
      /^\/episodes\/[^/]+\/$/u,
    );
    await expect(
      page.locator('[data-evidence-publication-status="withheld"]'),
    ).toHaveCount(0);
  });
});

test("book detail separates verified edition facts from translation assessment", async ({
  page,
}) => {
  await test.step("Given a public book with a catalogued edition", () =>
    page.goto(BOOK_PATH));

  const versionSection = page.locator('[data-section-order="2"]');

  await test.step("Then supported book facts appear and the assessment is visibly unverified", async () => {
    await expect(versionSection.getByText("商务印书馆")).toBeVisible();
    await expect(versionSection.getByText("9787100011174")).toBeVisible();
    await expect(
      versionSection.getByRole("heading", { name: "翻译质量" }),
    ).toBeVisible();
    await expect(versionSection.getByText(/未核实/u)).toBeVisible();
    await expect(
      versionSection.getByText("译者", { exact: true }),
    ).toBeVisible();
  });
});

test("non-book detail never renders book-only version fields", async ({
  page,
}) => {
  await test.step("Given a public film with a confirmed director", () =>
    page.goto(FILM_PATH));

  const factsSection = page.locator('[data-section-order="2"]');
  const headerSection = page.locator('[data-section-order="0"]');

  await test.step("Then it shows the supported creator fact without book-only structures", async () => {
    await expect(
      factsSection.getByRole("heading", { level: 2, name: "作品资料" }),
    ).toBeVisible();
    await expect(factsSection.getByText("导演或创作者")).toBeVisible();
    await expect(factsSection.getByText("罗杰·唐纳森")).toBeVisible();
    await expect(headerSection.getByText("作者或创作者")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "翻译质量" })).toHaveCount(
      0,
    );
    await expect(factsSection.getByText("ISBN", { exact: true })).toHaveCount(
      0,
    );
    await expect(factsSection.getByText("出版社", { exact: true })).toHaveCount(
      0,
    );
    await expect(factsSection.getByText("译者", { exact: true })).toHaveCount(
      0,
    );
  });
});

test("work detail uses the generated cover and keeps missing similarity explicit", async ({
  page,
}) => {
  await test.step("Given the enriched book detail", () => page.goto(BOOK_PATH));

  const headerSection = page.locator('[data-section-order="0"]');
  const hardRelations = page.locator('[data-section-order="3"]');
  const similarRelations = page.locator('[data-section-order="4"]');

  await test.step("Then the local fallback and derived hard relations are shown without fabricated similarity", async () => {
    await expect(headerSection.locator("[data-work-hero]")).toHaveAttribute(
      "src",
      "/generated-covers/经济发展理论-6d5b7b.svg",
    );
    await expect(hardRelations.locator(".relation-record")).toHaveCount(2);
    await expect(
      similarRelations.getByText("暂无已核验相似作品"),
    ).toBeVisible();
  });
});

test("work detail displays image license and attribution", async ({ page }) => {
  await page.goto(BOOK_PATH);

  const sourceSection = page.locator('[data-section-order="5"]');

  await expect(
    sourceSection.getByText("许可：site-generated", { exact: true }),
  ).toBeVisible();
  await expect(
    sourceSection.getByText("署名：不明白知识库", { exact: true }),
  ).toBeVisible();
});

test("episode detail exposes confirmed guests and safe official source", async ({
  page,
}) => {
  await test.step("Given a public episode with confirmed guests and recommendation records", () =>
    page.goto(EPISODE_PATH));

  const officialLink = page.getByRole("link", { name: "官方节目页" });

  await test.step("Then only supported public information is exposed", async () => {
    await expect(page.getByText("许成钢", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: "推荐记录" }),
    ).toBeVisible();
    await expect(officialLink).toHaveAttribute("href", /^https:\/\//u);
    await expect(officialLink).toHaveAttribute("rel", "external noreferrer");
    await expect(page.locator("[data-work-card] h4 a")).toHaveCount(3);
    await expect(page.locator("[data-work-card] h4 a").first()).toHaveAttribute(
      "href",
      /^\/works\/[^/]+\/$/u,
    );
  });
});

for (const route of detailRoutes) {
  test(`${route} has one h1, no horizontal overflow, and no high-impact axe issues`, async ({
    page,
  }) => {
    await test.step("Given a rendered detail route at the configured viewport", () =>
      page.goto(route));

    const hasOverflow = await test.step("When its document is inspected", () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ));
    const violations = (
      await test.step("When its accessibility tree is inspected", () =>
        new AxeBuilder({ page }).analyze())
    ).violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );

    await test.step("Then the page has one title, fits the viewport, and has no serious defects", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(hasOverflow).toBe(false);
      expect(violations).toEqual([]);
    });
  });
}

test("official episode link retains a visible keyboard focus indicator", async ({
  page,
}) => {
  await test.step("Given the episode detail page", () =>
    page.goto(EPISODE_PATH));
  const officialLink = page.getByRole("link", { name: "官方节目页" });

  await test.step("When keyboard focus reaches the official link", () =>
    officialLink.focus());

  await test.step("Then the shared focus treatment remains visible", async () => {
    await expect(officialLink).toBeFocused();
    await expect(officialLink).toHaveCSS("outline-style", "solid");
  });
});

test("mobile episode title keeps the confirmed guest name on one line", async ({
  page,
}) => {
  await test.step("Given a narrow episode detail page", async () => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(EPISODE_PATH);
  });

  const guestNameLines =
    await test.step("When the confirmed name is measured", () =>
      page
        .getByRole("heading", { level: 1 })
        .evaluate(countPhraseLines, "许成钢"));

  await test.step("Then the confirmed name remains an intact phrase", () => {
    expect(guestNameLines).toBe(1);
  });
});

test("mobile official evidence keeps the confirmed name on one line", async ({
  page,
}) => {
  await test.step("Given a narrow film detail page", async () => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(FILM_PATH);
  });

  const evidenceNameLines =
    await test.step("When the confirmed name is measured", () =>
      page
        .locator("[data-evidence-panel] .evidence-episode")
        .evaluate(countPhraseLines, "张又侠"));

  await test.step("Then the confirmed name remains an intact phrase", () => {
    expect(evidenceNameLines).toBe(1);
  });
});
