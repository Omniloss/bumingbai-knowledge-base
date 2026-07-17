import { describe, expect, test } from "vitest";
import {
  countAuditedScores,
  type LighthouseScores,
  type LighthouseSummary,
  scoreFailures,
} from "../../tools/lighthouse-score";

const PERFECT_SCORES: LighthouseScores = {
  accessibility: 100,
  "best-practices": 100,
  performance: 100,
  seo: 100,
};

function summaryWith(score: LighthouseScores): LighthouseSummary {
  return {
    desktop: {
      median: PERFECT_SCORES,
      runs: [PERFECT_SCORES, PERFECT_SCORES, PERFECT_SCORES],
    },
    mobile: {
      median: PERFECT_SCORES,
      runs: [PERFECT_SCORES, score, PERFECT_SCORES],
    },
  };
}

describe("Lighthouse raw-score gate", () => {
  test("accepts all 24 perfect category scores", () => {
    const summary = summaryWith(PERFECT_SCORES);

    expect(countAuditedScores(summary)).toBe(24);
    expect(scoreFailures(summary)).toEqual([]);
  });

  test("identifies a single sub-100 run even when medians remain perfect", () => {
    const summary = summaryWith({ ...PERFECT_SCORES, performance: 99 });

    expect(scoreFailures(summary)).toEqual([
      { category: "performance", preset: "mobile", run: 2, score: 99 },
    ]);
  });
});
