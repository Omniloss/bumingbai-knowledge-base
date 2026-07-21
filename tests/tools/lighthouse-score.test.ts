import { describe, expect, test } from "vitest";
import {
  countAuditedScores,
  type LighthouseScores,
  type LighthouseSummary,
  percentageSummary,
  scoreFailures,
} from "../../tools/lighthouse-score";

const PERFECT_SCORES: LighthouseScores = {
  accessibility: 1,
  "best-practices": 1,
  performance: 1,
  seo: 1,
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
  test("accepts all 24 exact raw scores", () => {
    const summary = summaryWith(PERFECT_SCORES);

    expect(countAuditedScores(summary)).toBe(24);
    expect(scoreFailures(summary)).toEqual([]);
  });

  test("rejects a near-perfect raw score that would round to 100", () => {
    const summary = summaryWith({ ...PERFECT_SCORES, performance: 0.996 });

    expect(scoreFailures(summary)).toEqual([
      { category: "performance", preset: "mobile", run: 2, score: 0.996 },
    ]);
  });

  test("converts raw scores to percentages only for reporting", () => {
    const report = percentageSummary(
      summaryWith({ ...PERFECT_SCORES, performance: 0.996 }),
    );

    expect(report.mobile.runs[1]?.performance).toBe(99.6);
    expect(report.desktop.median.performance).toBe(100);
  });
});
