import { describe, expect, it } from "vitest";
import { mergeDetailSources } from "../../src/lib/detail-sources.js";

describe("mergeDetailSources", () => {
  it("retains image provenance when it shares a URL with entity metadata", () => {
    const sources = mergeDetailSources([
      {
        kind: "publisher",
        label: "作品数据来源",
        url: "https://example.com/work",
      },
      {
        attribution: "Artist One",
        kind: "image",
        label: "图片来源",
        license: "CC BY 4.0",
        url: "https://example.com/work",
      },
    ]);

    expect(sources).toEqual([
      {
        attribution: "Artist One",
        kind: "image",
        label: "图片来源",
        license: "CC BY 4.0",
        url: "https://example.com/work",
      },
    ]);
  });

  it("retains distinct image attributions for one source URL", () => {
    const sources = mergeDetailSources([
      {
        attribution: "Artist One",
        kind: "image",
        label: "图片来源",
        license: "CC BY 4.0",
        url: "https://example.com/work",
      },
      {
        attribution: "Artist Two",
        kind: "image",
        label: "图片来源",
        license: "CC BY-SA 4.0",
        url: "https://example.com/work",
      },
    ]);

    expect(sources.map((source) => source.attribution)).toEqual([
      "Artist One",
      "Artist Two",
    ]);
  });
});
