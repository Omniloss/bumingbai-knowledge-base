import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type SimilarityInput,
  scoreSimilarity,
} from "../../src/relations/similarity.js";

type HasSameEpisode = "sameEpisode" extends keyof SimilarityInput
  ? true
  : false;

describe("scoreSimilarity", () => {
  it("returns deterministic explanations for structured overlap", () => {
    const result = scoreSimilarity({
      sharedTopicRatio: 1,
      embeddingSimilarity: 0.9,
      sameMediaType: true,
      eraRegionRatio: 0.5,
      recommenderOverlap: true,
      editorial: false,
    });

    expect(result).toEqual({
      score: 0.64,
      reasons: ["主题相近", "体裁或媒介相同", "时代或地域相近", "推荐人重合"],
    });
  });

  it("rejects vector-only similarity", () => {
    expect(
      scoreSimilarity({
        sharedTopicRatio: 0,
        embeddingSimilarity: 1,
        sameMediaType: false,
        eraRegionRatio: 0,
        recommenderOverlap: false,
        editorial: false,
      }),
    ).toBeUndefined();
  });

  it("keeps same_episode outside the similarity contract", () => {
    expectTypeOf<HasSameEpisode>().toEqualTypeOf<false>();

    const result = scoreSimilarity({
      sharedTopicRatio: 0,
      sameMediaType: true,
      eraRegionRatio: 0,
      recommenderOverlap: false,
      editorial: false,
    });

    expect(result?.reasons).not.toContain("同一期节目推荐");
  });

  it("clamps every numeric signal without allowing negative deductions", () => {
    expect(
      scoreSimilarity({
        sharedTopicRatio: 2,
        embeddingSimilarity: -1,
        sameMediaType: true,
        eraRegionRatio: Number.POSITIVE_INFINITY,
        recommenderOverlap: true,
        editorial: true,
      }),
    ).toEqual({
      score: 0.6,
      reasons: ["主题相近", "体裁或媒介相同", "推荐人重合", "人工专题关联"],
    });
  });

  it("returns undefined when no structured signal remains after clamping", () => {
    expect(
      scoreSimilarity({
        sharedTopicRatio: Number.NaN,
        embeddingSimilarity: Number.POSITIVE_INFINITY,
        sameMediaType: false,
        eraRegionRatio: -2,
        recommenderOverlap: false,
        editorial: false,
      }),
    ).toBeUndefined();
  });
});
