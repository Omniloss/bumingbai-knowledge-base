import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const workPath = "/works/经济发展理论-6d5b7b/";
const coverPath = "/generated-covers/经济发展理论-6d5b7b.svg";

test("work index and detail expose eligible generated covers", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/works/");
  const firstThumbnail = page.locator("[data-work-card] img").first();
  await expect(firstThumbnail).toBeVisible();
  await expect(firstThumbnail).toHaveAttribute("loading", "lazy");
  await expect(firstThumbnail).toHaveAttribute("decoding", "async");

  await page.goto(workPath);
  const hero = page.locator("[data-work-hero]");
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute("src", coverPath);
  await expect(hero).toHaveAttribute("width", "800");
  await expect(hero).toHaveAttribute("height", "1200");

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(overflow).toBe(false);
  expect(violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("generated cover endpoint is a safe SVG response", async ({ request }) => {
  const response = await request.get(coverPath);
  const body = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/svg+xml");
  expect(body).toContain("经济发展理论");
  expect(body).not.toContain("<script>");
});
