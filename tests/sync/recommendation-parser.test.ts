import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseRecommendationCandidates,
  type RecommendationCandidate,
} from "../../src/sync/recommendation-parser.js";
import { writeRecommendationCandidateQueue } from "../../src/sync/run-sync.js";

const sourceUrl = "https://bumingbai.net/episodes/ep-223/";

function parse(html: string) {
  return parseRecommendationCandidates({
    episodeNumber: 223,
    html,
    sourceUrl,
  });
}

describe("parseRecommendationCandidates", () => {
  it("keeps each source line from an approved recommendation section", () => {
    const candidates = parse(`
      <h2> 嘉宾推荐 </h2>
      <p>杨樱：</p>
      <p>《休战》 普里莫·莱维 著</p>
      <h2>相关链接</h2>
      <p>《不应进入审核的链接作品》</p>
    `);

    expect(candidates).toEqual([
      expect.objectContaining({
        episodeNumber: 223,
        recommenderLabel: "杨樱",
        rawText: "《休战》 普里莫·莱维 著",
        sourceUrl,
        risk: "high",
        status: "pending_verification",
      }),
    ]);
    expect(candidates[0]?.locator).toMatch(/^html > body > /u);
    expect(
      parse(`
      <h2> 嘉宾推荐 </h2>
      <p>杨樱：</p>
      <p>《休战》 普里莫·莱维 著</p>
      <h2>相关链接</h2>
      <p>《不应进入审核的链接作品》</p>
    `)[0]?.locator,
    ).toBe(candidates[0]?.locator);
  });

  it("keeps multiple works under the same recommender", () => {
    expect(
      parse(`
        <h3>嘉宾推荐书目</h3>
        <ul>
          <li>杨樱：</li>
          <li>《休战》 普里莫·莱维 著</li>
          <li>《客居己乡》 哲尔吉·康拉德 著</li>
        </ul>
      `).map(({ rawText, recommenderLabel }) => ({
        rawText,
        recommenderLabel,
      })),
    ).toEqual([
      { rawText: "《休战》 普里莫·莱维 著", recommenderLabel: "杨樱" },
      { rawText: "《客居己乡》 哲尔吉·康拉德 著", recommenderLabel: "杨樱" },
    ]);
  });

  it("accepts an approved heading carried by a standalone paragraph", () => {
    expect(
      parse(`
        <p>本期推荐</p>
        <p>《休战》 普里莫·莱维 著</p>
      `).map((candidate) => candidate.rawText),
    ).toEqual(["《休战》 普里莫·莱维 著"]);
  });

  it("does not split a source line containing multiple book titles", () => {
    expect(
      parse(`
        <h2>推荐作品</h2>
        <p>《俄国思想家》和《浪漫主义的根源》等</p>
      `).map((candidate) => candidate.rawText),
    ).toEqual(["《俄国思想家》和《浪漫主义的根源》等"]);
  });

  it("returns no candidates without an exact approved heading", () => {
    expect(
      parse(`
        <h2>嘉宾推荐：</h2>
        <p>《休战》 普里莫·莱维 著</p>
      `),
    ).toEqual([]);
  });

  it("ignores incidental prose mentions of recommendations", () => {
    expect(
      parse("<p>节目正文提到嘉宾推荐过《休战》，但这不是一个正式栏目。</p>"),
    ).toEqual([]);
  });
});

describe("writeRecommendationCandidateQueue", () => {
  it("deduplicates and deterministically sorts high-risk pending candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "bumingbai-candidates-"));
    const candidates: RecommendationCandidate[] = [
      {
        episodeNumber: 221,
        rawText: "《B》",
        sourceUrl: "https://example.test/221/",
        locator: "html > body > p:nth-of-type(2)",
        risk: "high",
        status: "pending_verification",
      },
      {
        episodeNumber: 223,
        rawText: "《A》",
        sourceUrl,
        locator: "html > body > p:nth-of-type(3)",
        risk: "high",
        status: "pending_verification",
      },
      {
        episodeNumber: 223,
        rawText: "《A》",
        sourceUrl,
        locator: "html > body > p:nth-of-type(1)",
        risk: "high",
        status: "pending_verification",
      },
      {
        episodeNumber: 223,
        rawText: "《C》",
        sourceUrl,
        locator: "html > body > p:nth-of-type(4)",
        risk: "high",
        status: "pending_verification",
      },
    ];

    const path = await writeRecommendationCandidateQueue(root, candidates);

    expect(path).toBe(join(root, "data", "review", "sync-candidates.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual([
      candidates[2],
      candidates[3],
      candidates[0],
    ]);
  });
});

it("keeps the review queue out of public catalog and search code", async () => {
  const publicReaders = await Promise.all([
    readFile("src/lib/catalog.ts", "utf8"),
    readFile("tools/build-search-index.ts", "utf8"),
  ]);

  for (const reader of publicReaders) {
    expect(reader).not.toContain("sync-candidates.json");
  }
});
