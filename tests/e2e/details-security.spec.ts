import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SECURITY_ROUTES = ["/episodes/ep-110/", "/episodes/ep-151/"] as const;

test("non-HTTPS episode sources are never rendered as links", async ({
  page,
}) => {
  await page.goto("/episodes/ep-110/");

  await expect(page.getByRole("link", { name: "官方节目页" })).toHaveCount(0);
  await expect(
    page.getByText("官方节目页链接未通过 HTTPS 安全校验"),
  ).toBeVisible();
  await expect(page.locator('a[href^="http://"]')).toHaveCount(0);
});

test("pending recommendation candidates remain undisclosed", async ({
  page,
}) => {
  await page.goto("/episodes/ep-151/");

  await expect(
    page.getByText("另有推荐记录仍在核验，候选信息暂不公开。"),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Conclave");
  await expect(page.locator("body")).not.toContainText(
    "电影《秘密会议》（《Conclave》）爱德华·贝尔格",
  );
  await expect(
    page.locator('[data-evidence-publication-status="withheld"]'),
  ).toHaveCount(0);
});

for (const route of SECURITY_ROUTES) {
  test(`${route} remains accessible and error-free`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.goto(route);

    const hasOverflow = await page.evaluate(
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

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(hasOverflow).toBe(false);
    expect(runtimeErrors).toEqual([]);
    expect(violations).toEqual([]);
  });
}
