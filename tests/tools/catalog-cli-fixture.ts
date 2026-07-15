import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";

const TOOL_PATH = fileURLToPath(
  new URL("../../tools/validate-data.ts", import.meta.url),
);
const EMPTY_CATALOG = CatalogSchema.parse({
  schemaVersion: 1,
  generatedAt: "2026-07-14T00:00:00.000Z",
  episodes: [],
  people: [],
  topics: [],
  works: [],
  editions: [],
  recommendationEvidence: [],
  imageAssets: [],
  workRelations: [],
  providerRecords: [],
  reviewIssues: [],
});

export const EMPTY_COUNT_LINE =
  "episodes=0 people=0 topics=0 works=0 editions=0 recommendationEvidence=0 imageAssets=0 workRelations=0 providerRecords=0 reviewIssues=0\n";

export type CatalogFixture = {
  readonly rootDir: string;
  readonly catalogDir: string;
};

export async function createCatalogFixture(): Promise<CatalogFixture> {
  const rootDir = await mkdtemp(join(tmpdir(), "catalog-entry-"));
  const catalogDir = join(rootDir, "data", "catalog");
  const reviewDir = join(rootDir, "data", "review");
  const { schemaVersion, generatedAt, reviewIssues, ...entityFiles } =
    EMPTY_CATALOG;
  const catalogFiles = {
    ...entityFiles,
    meta: { schemaVersion, generatedAt },
  };
  await Promise.all([
    mkdir(catalogDir, { recursive: true }),
    mkdir(reviewDir, { recursive: true }),
  ]);
  await Promise.all(
    Object.entries(catalogFiles).map(([name, value]) =>
      writeFile(
        join(
          catalogDir,
          `${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}.json`,
        ),
        JSON.stringify(value),
      ),
    ),
  );
  await writeFile(join(reviewDir, "issues.json"), JSON.stringify(reviewIssues));
  return { rootDir, catalogDir };
}

export function runCatalogEntry(rootDir: string): SpawnSyncReturns<string> {
  return spawnSync("bun", ["run", TOOL_PATH], {
    cwd: rootDir,
    encoding: "utf8",
  });
}

export function importCatalogModule(): SpawnSyncReturns<string> {
  const moduleUrl = pathToFileURL(TOOL_PATH).href;
  return spawnSync(
    "bun",
    ["-e", `await import(${JSON.stringify(moduleUrl)})`],
    {
      encoding: "utf8",
    },
  );
}

export async function writeWorksFile(
  fixture: CatalogFixture,
  value: unknown,
): Promise<void> {
  await writeFile(
    join(fixture.catalogDir, "works.json"),
    JSON.stringify(value),
  );
}

export async function removeCatalogFixture(
  fixture: CatalogFixture,
): Promise<void> {
  await rm(fixture.rootDir, { recursive: true, force: true });
}
