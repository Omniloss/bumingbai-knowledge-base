import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { migrateLegacy } from "../src/migration/legacy.js";

const inputPath = process.argv[2] ?? "work/bumingbai_structured.json";
const outputDir = process.argv[3] ?? "data/catalog";
const raw: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const catalog = migrateLegacy(raw, new Date().toISOString());
const reviewDir = join("data", "review");

await mkdir(outputDir, { recursive: true });
await mkdir(reviewDir, { recursive: true });

const outputs = {
  "meta.json": {
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
  },
  "episodes.json": catalog.episodes,
  "people.json": catalog.people,
  "topics.json": catalog.topics,
  "works.json": catalog.works,
  "editions.json": catalog.editions,
  "recommendation-evidence.json": catalog.recommendationEvidence,
  "image-assets.json": catalog.imageAssets,
  "work-relations.json": catalog.workRelations,
  "provider-records.json": catalog.providerRecords,
} as const;

await Promise.all(
  Object.entries(outputs).map(([name, value]) =>
    writeFile(
      join(outputDir, name),
      `${JSON.stringify(value, undefined, 2)}\n`,
    ),
  ),
);
await writeFile(
  join(reviewDir, "issues.json"),
  `${JSON.stringify(catalog.reviewIssues, undefined, 2)}\n`,
);
