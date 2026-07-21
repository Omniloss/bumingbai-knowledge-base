import { expect, test } from "@playwright/test";
import { expectAccessiblePage } from "./accessibility-helpers";

const TEMPLATE_ROUTES = [
  "/",
  "/episodes/",
  "/works/",
  "/about/methodology/",
  "/episodes/ep-220/",
  "/episodes/ep-110/",
  "/works/经济发展理论-6d5b7b/",
  "/works/惊爆十三天-53a333/",
  "/people/袁莉-102966/",
] as const;

for (const route of TEMPLATE_ROUTES) {
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
