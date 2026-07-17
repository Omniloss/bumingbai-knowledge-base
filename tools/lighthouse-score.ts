export const LIGHTHOUSE_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;
const LIGHTHOUSE_PRESETS = ["mobile", "desktop"] as const;

export type LighthouseCategory = (typeof LIGHTHOUSE_CATEGORIES)[number];
export type LighthousePreset = "mobile" | "desktop";
export type LighthouseScores = Readonly<Record<LighthouseCategory, number>>;
export type LighthousePresetSummary = {
  readonly median: LighthouseScores;
  readonly runs: readonly LighthouseScores[];
};
export type LighthouseSummary = Readonly<
  Record<LighthousePreset, LighthousePresetSummary>
>;
export type LighthouseScoreFailure = {
  readonly category: LighthouseCategory;
  readonly preset: LighthousePreset;
  readonly run: number;
  readonly score: number;
};

export function countAuditedScores(summary: LighthouseSummary): number {
  return LIGHTHOUSE_PRESETS.reduce(
    (total, preset) =>
      total + summary[preset].runs.length * LIGHTHOUSE_CATEGORIES.length,
    0,
  );
}

export function scoreFailures(
  summary: LighthouseSummary,
): readonly LighthouseScoreFailure[] {
  const failures: LighthouseScoreFailure[] = [];
  for (const preset of LIGHTHOUSE_PRESETS) {
    summary[preset].runs.forEach((scores, index) => {
      for (const category of LIGHTHOUSE_CATEGORIES) {
        const score = scores[category];
        if (score < 100) {
          failures.push({ category, preset, run: index + 1, score });
        }
      }
    });
  }
  return failures;
}
