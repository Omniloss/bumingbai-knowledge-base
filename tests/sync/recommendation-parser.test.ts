import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseRecommendationCandidates,
  type RecommendationCandidate,
} from "../../src/sync/recommendation-parser.js";
import { writeRecommendationCandidateQueue } from "../../src/sync/run-sync.js";
import {
  EPISODE_216_RECOMMENDATIONS,
  EPISODE_220_RECOMMENDATIONS,
} from "../fixtures/sync/recommendation-html.js";

const sourceUrl = "https://bumingbai.net/episodes/ep-223/";
const retrievedAt = "2026-07-18T00:00:00.000Z";

function parse(html: string) {
  return parseRecommendationCandidates({
    episodeNumber: 223,
    html,
    sourceUrl,
    retrievedAt,
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
        retrievedAt,
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

  it("parses official-style br-separated lines with retrieval provenance", () => {
    const first = parseRecommendationCandidates(EPISODE_220_RECOMMENDATIONS);
    const second = parseRecommendationCandidates(EPISODE_220_RECOMMENDATIONS);

    expect(first).toEqual([
      expect.objectContaining({
        rawText: "杨继绳《天地翻覆—中国文化大革命史》",
        retrievedAt: EPISODE_220_RECOMMENDATIONS.retrievedAt,
        locator: "html > body > p:nth-of-type(1)::line(1)",
      }),
      expect.objectContaining({
        rawText: "王友琴《文革受难者关于迫害、监禁和杀戮的寻访实录》",
        retrievedAt: EPISODE_220_RECOMMENDATIONS.retrievedAt,
        locator: "html > body > p:nth-of-type(1)::line(2)",
      }),
      expect.objectContaining({
        rawText: "北岛、李陀《七十年代》",
        retrievedAt: EPISODE_220_RECOMMENDATIONS.retrievedAt,
        locator: "html > body > p:nth-of-type(1)::line(3)",
      }),
    ]);
    expect(second).toEqual(first);
    expect(
      parseRecommendationCandidates(EPISODE_216_RECOMMENDATIONS).map(
        (candidate) => candidate.rawText,
      ),
    ).toEqual([
      "孙怒涛：《历史拒绝遗忘: 清华十年文革回忆反思集（上、下）》",
      "https://a.co/d/08yhLea9",
      "https://a.co/d/02zZO6xH",
      "杨继绳《天地翻覆—中国文化大革命史》",
      "启之《内蒙古文革实录》",
      "https://dokumen.pub/9881751586-9789881751584.html",
    ]);
  });

  it("rejects an incidental inline approved-heading token", () => {
    expect(
      parse("<p>节目正文 <strong>嘉宾推荐：</strong><br>《休战》</p>"),
    ).toEqual([]);
  });

  it("stops before nested non-approved section headings", () => {
    expect(
      parse(`
        <h2>嘉宾推荐</h2>
        <div>
          <p>《正式推荐》</p>
          <h3>相关链接</h3>
          <p>《不得进入队列》</p>
        </div>
      `).map((candidate) => candidate.rawText),
    ).toEqual(["《正式推荐》"]);
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

  it.each([
    ["x".repeat(200_001), "Recommendation HTML exceeds maximum length"],
    [
      `${"<div>".repeat(65)}<p>嘉宾推荐</p>${"</div>".repeat(65)}`,
      "Recommendation HTML exceeds maximum DOM depth",
    ],
    ["<p></p>".repeat(2_001), "Recommendation HTML exceeds maximum DOM nodes"],
  ])("rejects bounded untrusted HTML without echoing it", (html, message) => {
    const error = () => parse(`${html} private-payload-marker`);

    let caught: unknown;
    try {
      error();
    } catch (reason: unknown) {
      caught = reason;
    }
    expect(caught).toBeInstanceOf(Error);
    if (!(caught instanceof Error)) throw new Error("Expected parser error");
    expect(caught.message).toBe(message);
    expect(caught.message).not.toContain("private-payload-marker");
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
        retrievedAt,
        locator: "html > body > p:nth-of-type(2)",
        risk: "high",
        status: "pending_verification",
      },
      {
        episodeNumber: 223,
        rawText: "《A》",
        sourceUrl,
        retrievedAt,
        locator: "html > body > p:nth-of-type(3)",
        risk: "high",
        status: "pending_verification",
      },
      {
        episodeNumber: 223,
        rawText: "《A》",
        sourceUrl,
        retrievedAt,
        locator: "html > body > p:nth-of-type(1)",
        risk: "high",
        status: "pending_verification",
      },
      {
        episodeNumber: 223,
        rawText: "《C》",
        sourceUrl,
        retrievedAt,
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
