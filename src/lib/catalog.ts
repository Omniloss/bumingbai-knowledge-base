import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Catalog,
  CatalogMetaSchema,
  CatalogSchema,
  type Episode,
  type Work,
} from "../domain/schemas/catalog.js";

const CATALOG_SENTINEL = "data/catalog/meta.json";

export class CatalogRootNotFoundError extends Error {
  readonly name = "CatalogRootNotFoundError";

  constructor(
    readonly startUrl: URL,
    readonly sentinelRelativePath: string,
  ) {
    super(
      `Could not find ${sentinelRelativePath} above ${fileURLToPath(startUrl)}`,
    );
  }
}

export function findCatalogRoot(startUrl: URL): URL {
  let directoryPath = fileURLToPath(new URL(".", startUrl));

  while (true) {
    if (existsSync(join(directoryPath, "data", "catalog", "meta.json"))) {
      return pathToFileURL(`${directoryPath}${sep}`);
    }

    const parentPath = dirname(directoryPath);
    if (parentPath === directoryPath) {
      throw new CatalogRootNotFoundError(startUrl, CATALOG_SENTINEL);
    }
    directoryPath = parentPath;
  }
}

const catalogRoot = findCatalogRoot(new URL(import.meta.url));

const CATALOG_FILES = {
  editions: new URL("data/catalog/editions.json", catalogRoot),
  episodes: new URL("data/catalog/episodes.json", catalogRoot),
  imageAssets: new URL("data/catalog/image-assets.json", catalogRoot),
  meta: new URL("data/catalog/meta.json", catalogRoot),
  people: new URL("data/catalog/people.json", catalogRoot),
  providerRecords: new URL("data/catalog/provider-records.json", catalogRoot),
  recommendationEvidence: new URL(
    "data/catalog/recommendation-evidence.json",
    catalogRoot,
  ),
  reviewIssues: new URL("data/review/issues.json", catalogRoot),
  topics: new URL("data/catalog/topics.json", catalogRoot),
  workRelations: new URL("data/catalog/work-relations.json", catalogRoot),
  works: new URL("data/catalog/works.json", catalogRoot),
} as const;

let catalogPromise: Promise<Catalog> | undefined;

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, "utf8"));
}

function compareSlugs(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= Promise.all([
    readJson(CATALOG_FILES.meta),
    readJson(CATALOG_FILES.episodes),
    readJson(CATALOG_FILES.people),
    readJson(CATALOG_FILES.topics),
    readJson(CATALOG_FILES.works),
    readJson(CATALOG_FILES.editions),
    readJson(CATALOG_FILES.recommendationEvidence),
    readJson(CATALOG_FILES.imageAssets),
    readJson(CATALOG_FILES.workRelations),
    readJson(CATALOG_FILES.providerRecords),
    readJson(CATALOG_FILES.reviewIssues),
  ]).then(
    ([
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
    ]) =>
      CatalogSchema.parse({
        ...CatalogMetaSchema.parse(meta),
        editions,
        episodes,
        imageAssets,
        people,
        providerRecords,
        recommendationEvidence,
        reviewIssues,
        topics,
        workRelations,
        works,
      }),
  );

  return catalogPromise;
}

export async function listPublicEpisodes(): Promise<readonly Episode[]> {
  return (await loadCatalog()).episodes
    .filter((episode) => episode.publicationStatus === "public")
    .sort((left, right) => {
      const dateOrder =
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      if (dateOrder !== 0) {
        return dateOrder;
      }

      if (left.number !== right.number) {
        if (left.number === null) {
          return 1;
        }
        if (right.number === null) {
          return -1;
        }
        return right.number - left.number;
      }

      return compareSlugs(left.slug, right.slug);
    });
}

export async function listPublicWorks(): Promise<readonly Work[]> {
  return (await loadCatalog()).works
    .filter((work) => work.publicationStatus === "public")
    .sort((left, right) => {
      const titleOrder = left.title.localeCompare(right.title, "zh-CN");
      return titleOrder || compareSlugs(left.slug, right.slug);
    });
}

export async function getEpisodeBySlug(
  slug: string,
): Promise<Episode | undefined> {
  return (await listPublicEpisodes()).find((episode) => episode.slug === slug);
}

export async function getWorkBySlug(slug: string): Promise<Work | undefined> {
  return (await listPublicWorks()).find((work) => work.slug === slug);
}
