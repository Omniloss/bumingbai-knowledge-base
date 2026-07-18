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
});
