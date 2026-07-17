import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import lighthouse, { desktopConfig } from "lighthouse";
import puppeteer from "puppeteer-core";

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const PRESETS = ["mobile", "desktop"];
const RUN_COUNT = 3;
const OUTPUT_PATH = path.join(
  process.cwd(),
  ".superpowers",
  "sdd",
  "task6-evidence",
  "lighthouse",
);
const CHROME_PATH =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function configFor(preset) {
  const presetConfig =
    preset === "desktop" ? desktopConfig : { extends: "lighthouse:default" };
  return {
    ...presetConfig,
    settings: {
      ...presetConfig.settings,
      onlyCategories: CATEGORIES,
    },
  };
}

function scoresFrom(result) {
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      Math.round((result.lhr.categories[category]?.score ?? 0) * 100),
    ]),
  );
}

function medianScores(runs) {
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const scores = runs
        .map((run) => run[category])
        .toSorted((left, right) => left - right);
      return [category, scores[1]];
    }),
  );
}

async function main() {
  const url = process.argv[2] ?? "http://127.0.0.1:4321/";
  await mkdir(OUTPUT_PATH, { recursive: true });
  const profilePath = await mkdtemp(
    path.join(os.tmpdir(), "task6-lighthouse-"),
  );
  const browser = await puppeteer.launch({
    args: ["--no-default-browser-check", "--no-first-run"],
    executablePath: CHROME_PATH,
    headless: true,
    pipe: true,
    userDataDir: profilePath,
  });
  const summary = {};

  try {
    for (const preset of PRESETS) {
      const runs = [];
      for (let run = 1; run <= RUN_COUNT; run += 1) {
        const page = await browser.newPage();
        const result = await lighthouse(
          url,
          { logLevel: "error", output: "json" },
          configFor(preset),
          page,
        ).finally(() => page.close());
        if (!result)
          throw new Error(
            `Lighthouse returned no ${preset} result for run ${run}`,
          );
        const scores = scoresFrom(result);
        runs.push(scores);
        await writeFile(
          path.join(OUTPUT_PATH, `${preset}-${run}.json`),
          typeof result.report === "string"
            ? result.report
            : result.report.join("\n"),
          "utf8",
        );
      }
      summary[preset] = { median: medianScores(runs), runs };
    }
  } finally {
    await browser.close();
    await rm(profilePath, {
      force: true,
      maxRetries: 3,
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

  const medians = Object.values(summary).flatMap(({ median }) =>
    Object.values(median),
  );
  if (medians.some((score) => score !== 100)) process.exitCode = 1;
}

await main();
