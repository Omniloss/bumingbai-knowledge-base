import { expect, test } from "@playwright/test";

test("methodology omits nonpublic review states", async ({ page }) => {
  await page.goto("/about/methodology/");

  await expect(page.getByRole("main")).not.toContainText("待核验");
  await expect(page.getByRole("main")).not.toContainText("已排除");
  await expect(page.getByRole("main")).not.toContainText("审核记录");
});

test("methodology shows the required TMDB attribution", async ({ page }) => {
  await page.goto("/about/methodology/");

  const tmdbLink = page.getByRole("link", {
    name: "The Movie Database (TMDB)",
  });
  await expect(tmdbLink).toHaveAttribute("href", "https://www.themoviedb.org/");
  await expect(tmdbLink.locator("img")).toHaveAttribute(
    "src",
    "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg",
  );
  await expect(page.getByRole("main")).toContainText(
    "This product uses the TMDB API but is not endorsed or certified by TMDB.",
  );
});

test("short CJK phrases stay intact on mobile pages", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });

  await page.goto("/");
  const searchPhrase = page.locator(".cjk-phrase", {
    hasText: "作品和主题",
  });
  await expect(searchPhrase).toHaveCSS("white-space", "nowrap");

  await page.goto("/about/methodology/");
  const methodologyPhrases = page.locator(".cjk-phrase");
  await expect(methodologyPhrases).toHaveText([
    "正式推荐栏目",
    "才会公开",
    "人物页",
  ]);
  for (const phrase of await methodologyPhrases.all()) {
    await expect(phrase).toHaveCSS("white-space", "nowrap");
  }
});

test("person page contains only public participation, creation, and recommendation sections", async ({
  page,
}) => {
  // Given
  await page.goto("/people/袁莉-102966/");

  // When
  const main = page.getByRole("main");

  // Then
  await expect(main.getByRole("heading", { name: "参与节目" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "创作作品" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "推荐作品" })).toBeVisible();
  await expect(main).not.toContainText("待核验");
  await expect(main).not.toContainText("已排除");
});
