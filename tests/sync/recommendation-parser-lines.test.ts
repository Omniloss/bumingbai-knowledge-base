import { describe, expect, it } from "vitest";
import { parseRecommendationCandidates } from "../../src/sync/recommendation-parser.js";

const input = {
  episodeNumber: 223,
  sourceUrl: "https://bumingbai.net/episodes/ep-223/",
  retrievedAt: "2026-07-18T00:00:00.000Z",
};

function parse(html: string) {
  return parseRecommendationCandidates({ ...input, html });
}

describe("recommendation source lines", () => {
  it("splits semantic-heading paragraph candidates only at br boundaries", () => {
    expect(
      parse("<h2>嘉宾推荐</h2><p>《A》<br>《B》</p>").map(
        ({ rawText, locator }) => ({ rawText, locator }),
      ),
    ).toEqual([
      { rawText: "《A》", locator: "html > body > p:nth-of-type(1)::line(1)" },
      { rawText: "《B》", locator: "html > body > p:nth-of-type(1)::line(2)" },
    ]);
  });

  it("splits list candidates at br boundaries but not between multiple titles", () => {
    expect(
      parse("<h2>嘉宾推荐</h2><ul><li>《A》和《B》<br>《C》</li></ul>").map(
        (candidate) => candidate.rawText,
      ),
    ).toEqual(["《A》和《B》", "《C》"]);
  });

  it("opens an empty approved WordPress paragraph heading", () => {
    expect(
      parse("<p><strong>嘉宾推荐：</strong></p><p>《A》</p>").map(
        (candidate) => candidate.rawText,
      ),
    ).toEqual(["《A》"]);
  });

  it("treats a direct strong paragraph label as a boundary", () => {
    expect(
      parse(
        "<h2>嘉宾推荐</h2><p>《A》</p><p><strong>相关链接：</strong><br>《B》</p>",
      ).map((candidate) => candidate.rawText),
    ).toEqual(["《A》"]);
  });

  it("treats a nested strong paragraph label as a boundary", () => {
    expect(
      parse(
        "<h2>嘉宾推荐</h2><div><p>《A》</p><p><b>相关链接：</b><br>《B》</p></div>",
      ).map((candidate) => candidate.rawText),
    ).toEqual(["《A》"]);
  });
});
