import { z } from "zod";
import { createStableId } from "../domain/id.js";
import { validateCatalog } from "../domain/publication.js";
import {
  type Catalog,
  CatalogSchema,
  type ImageAsset,
  type ProviderRecord,
  type ReviewIssue,
} from "../domain/schemas/catalog.js";
import { readProviderCache, writeProviderCache } from "../providers/cache.js";
import type {
  ProviderClient,
  ProviderName,
  ProviderResult,
} from "../providers/types.js";
import { buildHardRelations } from "../relations/hard-relations.js";
import { candidateOutput } from "./candidate-output.js";
import { type EmbeddingClient, loadEmbeddingVectors } from "./embeddings.js";
import { mergeImages } from "./images.js";
import { buildWorkLookup, lookupFingerprint } from "./lookup.js";
import { parseProviderResult, providerCandidates } from "./provider-data.js";
import { buildSimilarRelations } from "./similar-relations.js";

export type EnrichmentOptions = {
  readonly cacheRoot: string;
  readonly now: string;
  readonly offline?: boolean;
  readonly forceRefresh?: boolean;
  readonly embeddingClient?: EmbeddingClient;
};

function supportsMedia(
  provider: ProviderName,
  mediaType: Catalog["works"][number]["mediaType"],
): boolean {
  if (provider === "open_library") return mediaType === "book";
  if (provider === "tmdb") {
    return (
      mediaType === "film" ||
      mediaType === "television" ||
      mediaType === "documentary"
    );
  }
  return provider === "wikidata";
}

function safeProviderResult(
  provider: ProviderName,
  input: unknown,
): ProviderResult<unknown> | undefined {
  try {
    return parseProviderResult(provider, input);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return undefined;
    throw error;
  }
}

async function providerResult(
  client: ProviderClient<unknown>,
  query: Parameters<ProviderClient<unknown>["lookup"]>[0],
  options: EnrichmentOptions,
): Promise<ProviderResult<unknown> | undefined> {
  const cached = safeProviderResult(
    client.name,
    await readProviderCache(
      options.cacheRoot,
      client.name,
      query.workId,
      z.unknown(),
    ),
  );
  if (options.offline) return cached;
  try {
    const fresh = parseProviderResult(client.name, await client.lookup(query));
    await writeProviderCache(
      options.cacheRoot,
      client.name,
      query.workId,
      fresh,
    );
    return fresh;
  } catch {
    return cached;
  }
}

function providerRecord(
  workId: Catalog["works"][number]["id"],
  provider: ProviderName,
  externalId: string,
  retrievedAt: string,
  normalizedHash: string,
): ProviderRecord {
  return {
    id: createStableId("provider", workId, provider, externalId),
    provider,
    entityId: workId,
    externalId,
    retrievedAt,
    normalizedHash,
  };
}

function uniqueById<T extends { readonly id: string }>(
  values: readonly T[],
): T[] {
  return [
    ...new Map(values.map((value) => [value.id, value])).values(),
  ].toSorted((left, right) => left.id.localeCompare(right.id));
}

function uniqueByIdInOrder<T extends { readonly id: string }>(
  values: readonly T[],
): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export async function enrichCatalog(
  catalog: Catalog,
  clients: ProviderClient<unknown>[],
  options: EnrichmentOptions,
): Promise<Catalog> {
  const existing = CatalogSchema.parse(catalog);
  let records = [...existing.providerRecords];
  const incomingImages: ImageAsset[] = [];
  const removedImageIds = new Set<string>();
  const generatedIssues: ReviewIssue[] = [];

  for (const work of existing.works) {
    const query = buildWorkLookup(existing, work);
    const fingerprint = lookupFingerprint(query);
    for (const client of clients) {
      if (!supportsMedia(client.name, work.mediaType)) continue;
      const current = records.filter(
        (record) =>
          record.entityId === work.id && record.provider === client.name,
      );
      if (
        !options.forceRefresh &&
        current.some((record) => record.normalizedHash === fingerprint)
      )
        continue;
      const result = await providerResult(client, query, options);
      if (result === undefined) continue;

      for (const record of current) {
        removedImageIds.add(
          createStableId("image", work.id, client.name, record.externalId),
        );
      }
      records = records.filter(
        (record) =>
          !(record.entityId === work.id && record.provider === client.name),
      );
      const candidates = providerCandidates(client.name, result.records);
      if (candidates.length === 0) {
        records.push(
          providerRecord(
            work.id,
            client.name,
            "no-match",
            result.retrievedAt,
            fingerprint,
          ),
        );
        continue;
      }
      for (const candidate of candidates) {
        const output = candidateOutput(
          work,
          candidate,
          query.creatorNames,
          result.retrievedAt,
        );
        records.push(
          providerRecord(
            work.id,
            client.name,
            candidate.value.externalId,
            result.retrievedAt,
            fingerprint,
          ),
        );
        if (output.image !== undefined) incomingImages.push(output.image);
        generatedIssues.push(...output.issues);
      }
    }
  }

  const imageAssets = mergeImages(
    existing,
    incomingImages,
    removedImageIds,
    options.now,
  );
  const hardRelations = buildHardRelations(existing);
  const embeddings = await loadEmbeddingVectors(existing, {
    cacheRoot: options.cacheRoot,
    now: options.now,
    ...(options.offline === undefined ? {} : { offline: options.offline }),
    ...(options.forceRefresh === undefined
      ? {}
      : { forceRefresh: options.forceRefresh }),
    ...(options.embeddingClient === undefined
      ? {}
      : { client: options.embeddingClient }),
  });
  const editorialRelations = existing.workRelations.filter(
    (relation) => relation.kind === "editorial",
  );
  const workRelations = uniqueById([
    ...editorialRelations,
    ...hardRelations,
    ...buildSimilarRelations(existing, hardRelations, embeddings),
  ]);
  const enriched = CatalogSchema.parse({
    ...existing,
    generatedAt: options.now,
    imageAssets,
    providerRecords: uniqueById(records),
    reviewIssues: uniqueByIdInOrder([
      ...existing.reviewIssues,
      ...generatedIssues,
    ]),
    workRelations,
  });
  const issues = validateCatalog(enriched);
  if (issues.length > 0) {
    throw new Error(
      `Enriched catalog failed validation: ${issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  return enriched;
}
