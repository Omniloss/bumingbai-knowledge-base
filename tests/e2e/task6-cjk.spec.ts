import { expect, test } from "@playwright/test";

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

const cases = [
  {
    locator: '[data-recent-episode] h2:has-text("AI与中国世纪")',
    path: "/",
    phrase: "世纪：",
  },
  {
    locator: ".collection-header",
    path: "/works/",
    phrase: "公开的正式推荐证据",
  },
  {
    locator: "h1",
    path: "/episodes/ep-110/",
    phrase: "到达了",
  },
  {
    locator: "h1",
    path: "/episodes/ep-220/",
    phrase: "许成钢：",
  },
  {
    locator: ".collection-header",
    path: "/episodes/",
    phrase: "官方身份",
  },
] as const;

for (const item of cases) {
  test(`${item.path} keeps ${item.phrase} on one line at 375px`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 375 });
    await page.goto(item.path);

    const lines = await page
      .locator(item.locator)
      .evaluate(countPhraseLines, item.phrase);
    expect(lines).toBe(1);
  });
}
