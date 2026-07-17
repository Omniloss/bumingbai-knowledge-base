import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import lighthouse, {
  type Config,
  desktopConfig,
  type RunnerResult,
} from "lighthouse";
import puppeteer, { type Browser } from "puppeteer-core";
import { resolveLighthouseUrl } from "./lighthouse-args.ts";
import {
  countAuditedScores,
  LIGHTHOUSE_CATEGORIES,
  type LighthouseCategory,
  type LighthousePreset,
  type LighthousePresetSummary,
  type LighthouseScoreFailure,
  type LighthouseScores,
  type LighthouseSummary,
  scoreFailures,
} from "./lighthouse-score.ts";

const RUN_COUNT = 3;
const EXPECTED_SCORE_COUNT = RUN_COUNT * 2 * LIGHTHOUSE_CATEGORIES.length;
const OUTPUT_PATH = path.join(
  process.cwd(),
  ".superpowers",
  "sdd",
  "task6-evidence",
  "lighthouse",
);
const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

class LighthouseRunError extends Error {
  constructor(preset: LighthousePreset, run: number) {
    super(`Lighthouse returned no ${preset} result for run ${run}`);
    this.name = "LighthouseRunError";
  }
}

class LighthouseScoreCountError extends Error {
  constructor(count: number) {
    super(`Expected ${EXPECTED_SCORE_COUNT} raw scores, received ${count}`);
    this.name = "LighthouseScoreCountError";
  }
}

class LighthouseScoreGateError extends Error {
  constructor(failures: readonly LighthouseScoreFailure[]) {
    const details = failures
      .map(
        ({ category, preset, run, score }) =>
          `${preset} run ${run} ${category}: ${score}`,
      )
      .join(", ");
    super(`Lighthouse raw-score gate failed: ${details}`);
    this.name = "LighthouseScoreGateError";
  }
}

function configFor(preset: LighthousePreset): Config {
  const presetConfig: Config =
    preset === "desktop" ? desktopConfig : { extends: "lighthouse:default" };
  return {
    ...presetConfig,
    settings: {
      ...presetConfig.settings,
      onlyCategories: [...LIGHTHOUSE_CATEGORIES],
    },
  };
}

function categoryScore(
  result: RunnerResult,
  category: LighthouseCategory,
): number {
  return Math.round((result.lhr.categories[category]?.score ?? 0) * 100);
}

function scoresFrom(result: RunnerResult): LighthouseScores {
  return {
    accessibility: categoryScore(result, "accessibility"),
    "best-practices": categoryScore(result, "best-practices"),
    performance: categoryScore(result, "performance"),
    seo: categoryScore(result, "seo"),
  };
}

function medianFor(
  runs: readonly LighthouseScores[],
  category: LighthouseCategory,
): number {
  const scores = runs
    .map((run) => run[category])
    .toSorted((left, right) => left - right);
  return scores[Math.floor(scores.length / 2)] ?? 0;
}

function medianScores(runs: readonly LighthouseScores[]): LighthouseScores {
  return {
    accessibility: medianFor(runs, "accessibility"),
    "best-practices": medianFor(runs, "best-practices"),
    performance: medianFor(runs, "performance"),
    seo: medianFor(runs, "seo"),
  };
}

async function runPreset(
  browser: Browser,
  url: string,
  preset: LighthousePreset,
): Promise<LighthousePresetSummary> {
  const runs: LighthouseScores[] = [];
  for (let run = 1; run <= RUN_COUNT; run += 1) {
    const page = await browser.newPage();
    const result = await lighthouse(
      url,
      { logLevel: "error", output: "json" },
      configFor(preset),
      page,
    ).finally(() => page.close());
    if (!result) throw new LighthouseRunError(preset, run);
    runs.push(scoresFrom(result));
    await writeReport(result, preset, run);
  }
  return { median: medianScores(runs), runs };
}

async function writeReport(
  result: RunnerResult,
  preset: LighthousePreset,
  run: number,
): Promise<void> {
  await writeFile(
    path.join(OUTPUT_PATH, `${preset}-${run}.json`),
    typeof result.report === "string"
      ? result.report
      : result.report.join("\n"),
    "utf8",
  );
}

async function auditWithBrowser(
  url: string,
  profilePath: string,
): Promise<LighthouseSummary> {
  const browser = await puppeteer.launch({
    args: ["--no-default-browser-check", "--no-first-run"],
    executablePath: CHROME_PATH,
    headless: true,
    pipe: true,
    userDataDir: profilePath,
  });
  try {
    const mobile = await runPreset(browser, url, "mobile");
    const desktop = await runPreset(browser, url, "desktop");
    return { desktop, mobile };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const url = resolveLighthouseUrl(process.argv);
  await mkdir(OUTPUT_PATH, { recursive: true });
  const profilePath = await mkdtemp(
    path.join(os.tmpdir(), "task6-lighthouse-"),
  );
  let summary: LighthouseSummary;
  try {
    summary = await auditWithBrowser(url, profilePath);
  } finally {
    await rm(profilePath, {
      force: true,
      maxRetries: 20,
      recursive: true,
      retryDelay: 100,
    });
  }

  await writeFile(
    path.join(OUTPUT_PATH, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));

  const scoreCount = countAuditedScores(summary);
  if (scoreCount !== EXPECTED_SCORE_COUNT) {
    throw new LighthouseScoreCountError(scoreCount);
  }
  const failures = scoreFailures(summary);
  if (failures.length > 0) throw new LighthouseScoreGateError(failures);
}

await main();
