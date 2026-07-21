import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  type ValidationIssue,
  validateCatalog,
} from "../src/domain/publication.js";
import {
  type Catalog,
  CatalogMetaSchema,
  CatalogSchema,
} from "../src/domain/schemas/catalog.js";

const CatalogFilesSchema = z
  .object({
    meta: CatalogMetaSchema,
    episodes: z.unknown(),
    people: z.unknown(),
    topics: z.unknown(),
    works: z.unknown(),
    editions: z.unknown(),
    recommendationEvidence: z.unknown(),
    imageAssets: z.unknown(),
    workRelations: z.unknown(),
    providerRecords: z.unknown(),
    reviewIssues: z.unknown(),
  })
  .readonly();

export class CatalogFileReadError extends Error {
  override readonly name = "CatalogFileReadError";

  constructor(
    readonly filePath: string,
    cause: Error,
  ) {
    super(`Unable to read catalog file ${filePath}`, { cause });
  }
}

export function parseCatalogFiles(input: unknown): Catalog {
  const files = CatalogFilesSchema.parse(input);
  return CatalogSchema.parse({
    ...files.meta,
    episodes: files.episodes,
    people: files.people,
    topics: files.topics,
    works: files.works,
    editions: files.editions,
    recommendationEvidence: files.recommendationEvidence,
    imageAssets: files.imageAssets,
    workRelations: files.workRelations,
    providerRecords: files.providerRecords,
    reviewIssues: files.reviewIssues,
  });
}

export function formatValidationIssue(issue: ValidationIssue): string {
  return `${issue.code} ${issue.entityId} ${issue.message}`;
}

export function formatCatalogCounts(catalog: Catalog): string {
  return [
    `episodes=${catalog.episodes.length}`,
    `people=${catalog.people.length}`,
    `topics=${catalog.topics.length}`,
    `works=${catalog.works.length}`,
    `editions=${catalog.editions.length}`,
    `recommendationEvidence=${catalog.recommendationEvidence.length}`,
    `imageAssets=${catalog.imageAssets.length}`,
    `workRelations=${catalog.workRelations.length}`,
    `providerRecords=${catalog.providerRecords.length}`,
    `reviewIssues=${catalog.reviewIssues.length}`,
  ].join(" ");
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return parsed;
  } catch (error) {
    if (error instanceof Error) throw new CatalogFileReadError(filePath, error);
    throw error;
  }
}

export async function readCatalog(rootDir: string): Promise<Catalog> {
  const catalogDir = join(rootDir, "data", "catalog");
  const reviewDir = join(rootDir, "data", "review");
  const [
    meta,
    episodes,
    people,
    topics,
    works,
    editions,
    recommendationEvidence,
    imageAssets,
    workRelations,
    providerRecords,
    reviewIssues,
  ] = await Promise.all([
    readJsonFile(join(catalogDir, "meta.json")),
    readJsonFile(join(catalogDir, "episodes.json")),
    readJsonFile(join(catalogDir, "people.json")),
    readJsonFile(join(catalogDir, "topics.json")),
    readJsonFile(join(catalogDir, "works.json")),
    readJsonFile(join(catalogDir, "editions.json")),
    readJsonFile(join(catalogDir, "recommendation-evidence.json")),
    readJsonFile(join(catalogDir, "image-assets.json")),
    readJsonFile(join(catalogDir, "work-relations.json")),
    readJsonFile(join(catalogDir, "provider-records.json")),
    readJsonFile(join(reviewDir, "issues.json")),
  ]);
  return parseCatalogFiles({
    meta,
    episodes,
    people,
    topics,
    works,
    editions,
    recommendationEvidence,
    imageAssets,
    workRelations,
    providerRecords,
    reviewIssues,
  });
}

type WriteLine = (line: string) => void;

export async function runValidationCli(
  rootDir: string,
  writeLine: WriteLine,
): Promise<number> {
  const catalog = await readCatalog(rootDir);
  const issues = validateCatalog(catalog);
  if (issues.length === 0) {
    writeLine(formatCatalogCounts(catalog));
    return 0;
  }
  for (const issue of issues) writeLine(formatValidationIssue(issue));
  return 1;
}

export async function main(): Promise<void> {
  process.exitCode = await runValidationCli(process.cwd(), (line) => {
    process.stdout.write(`${line}\n`);
  });
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(entryPath).href
) {
  await main();
}
