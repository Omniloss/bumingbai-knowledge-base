import { describe, expect, it } from "vitest";
import type { RecommendationCandidate } from "../../src/sync/recommendation-parser.js";
import { queueRecommendationCandidates } from "../../src/sync/run-sync.js";

function candidate(
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    episodeNumber: 223,
    rawText: "《A》",
    sourceUrl: "https://bumingbai.net/episodes/ep-223/",
    locator: "html > body > p:nth-of-type(1)",
    retrievedAt: "2026-07-18T00:00:00.000Z",
    risk: "high",
    status: "pending_verification",
    ...overrides,
  };
}

describe("queueRecommendationCandidates", () => {
  it("keeps episode number and source URL independently in the dedupe key", () => {
    const queue = queueRecommendationCandidates([
      candidate({ episodeNumber: 224 }),
      candidate({ sourceUrl: "https://bumingbai.net/episodes/ep-223-copy/" }),
      candidate({ locator: "html > body > p:nth-of-type(2)" }),
    ]);

    expect(queue).toHaveLength(3);
    expect(queue.map((entry) => entry.episodeNumber)).toEqual([224, 223, 223]);
    expect(queue[1]?.sourceUrl).toBe(
      "https://bumingbai.net/episodes/ep-223-copy/",
    );
  });

  it("uses source URL and recommender label as deterministic tie-breakers", () => {
    expect(
      queueRecommendationCandidates([
        candidate({ recommenderLabel: "beta", locator: "a" }),
        candidate({ recommenderLabel: "alpha", locator: "z" }),
        candidate({ sourceUrl: "https://a.example.test/", locator: "z" }),
      ]).map(({ sourceUrl, recommenderLabel }) => ({
        sourceUrl,
        recommenderLabel,
      })),
    ).toEqual([
      { sourceUrl: "https://a.example.test/", recommenderLabel: undefined },
      {
        sourceUrl: "https://bumingbai.net/episodes/ep-223/",
        recommenderLabel: "alpha",
      },
    ]);
  });
});
