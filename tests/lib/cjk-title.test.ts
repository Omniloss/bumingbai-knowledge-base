import { describe, expect, it } from "vitest";
import { segmentCjkTitle } from "../../src/lib/cjk-title.js";

describe("segmentCjkTitle", () => {
  it("keeps title punctuation with the preceding word", () => {
    expect(
      segmentCjkTitle("AI与中国世纪：中华").map(({ value }) => value),
    ).toContain("世纪：");
  });

  it("keeps the aspect particle with the preceding verb", () => {
    expect(
      segmentCjkTitle("是否到达了顶峰").map(({ value }) => value),
    ).toContain("到达了");
  });

  it("keeps a confirmed person name as one protected phrase", () => {
    expect(
      segmentCjkTitle("文革60周年丨许成钢：我的19岁", ["许成钢"]).map(
        ({ value }) => value,
      ),
    ).toContain("许成钢：");
  });
});
