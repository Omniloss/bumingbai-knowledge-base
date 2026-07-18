import { describe, expect, it } from "vitest";
import { renderGeneratedCoverSvg } from "../../src/images/generated-cover.js";

describe("renderGeneratedCoverSvg", () => {
  it("keeps CJK titles readable in a deterministic SVG", () => {
    const first = renderGeneratedCoverSvg({
      title: "经济发展理论",
      mediaLabel: "书籍",
    });
    const second = renderGeneratedCoverSvg({
      title: "经济发展理论",
      mediaLabel: "书籍",
    });

    expect(first).toBe(second);
    expect(first).toContain("经济发展理论");
    expect(first).toContain('viewBox="0 0 800 1200"');
    expect(first).toContain("不明白知识库");
  });

  it("escapes hostile title and label text without executable markup", () => {
    const svg = renderGeneratedCoverSvg({
      title: '"><script>alert("x")</script>&作品',
      mediaLabel: "书籍<&",
    });

    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain('alert("x")');
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;作品");
    expect(svg).toContain("书籍&lt;&amp;");
  });

  it.each([
    "现代性的扩展与危机全球化信息技术认同及其他关于如何看待这个动荡与分裂的世界的一次漫谈",
    "The Unexpected Origins of Radical Ideas and Their Consequences for the Modern World",
    "a".repeat(139),
  ])("wraps long visible title text into bounded tspan lines", (title) => {
    const svg = renderGeneratedCoverSvg({ title, mediaLabel: "书籍" });
    const lines = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/gu)].map(
      (match) => match[1],
    );

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines.every((line) => (line?.length ?? 0) <= 18)).toBe(true);
    expect(svg).toContain(`<title id="title">${title}</title>`);
  });

  it("does not split a Latin word across visible title lines", () => {
    const svg = renderGeneratedCoverSvg({
      mediaLabel: "书籍",
      title:
        "The Long Latin Title 与中文标题混排并且必须在小屏幕中保持清晰可读的安全换行",
    });
    const lines = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/gu)].map(
      (match) => match[1] ?? "",
    );

    expect(lines.some((line) => line.includes("Title"))).toBe(true);
  });

  it("truncates overflowed title lines visibly while preserving the complete escaped title", () => {
    const title = `${"危险<&标题 ".repeat(20)}结束`;
    const svg = renderGeneratedCoverSvg({ title, mediaLabel: "书籍" });

    expect(svg).toContain("…</tspan>");
    expect(svg).toContain(
      `<title id="title">${title.replace(/&/gu, "&amp;").replace(/</gu, "&lt;")}</title>`,
    );
    expect(svg).not.toContain("<script>");
  });
});
