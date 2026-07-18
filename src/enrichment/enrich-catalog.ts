import { createStableId } from "../domain/id.js";
import { validateCatalog } from "../domain/publication.js";
import {
  type Catalog,
  CatalogSchema,
  type ImageAsset,
  type ProviderRecord,
  type ReviewIssue,
  type WorkRelation,
} from "../domain/schemas/catalog.js";
import type { ProviderClient, ProviderName } from "../providers/types.js";
import { buildHardRelations } from "../relations/hard-relations.js";
import { candidateOutput } from "./candidate-output.js";
import { type EmbeddingClient, loadEmbeddingVectors } from "./embeddings.js";
import { mergeImages } from "./images.js";
import { buildWorkLookup, lookupFingerprint } from "./lookup.js";
import { loadProviderResult } from "./provider-cache.js";
import { providerCandidates } from "./provider-data.js";
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

function orderRelations(relations: readonly WorkRelation[]): WorkRelation[] {
  const unique = uniqueById(relations);
  return unique.toSorted((left, right) => {
    const fromOrder = left.fromWorkId.localeCompare(right.fromWorkId);
    if (fromOrder !== 0) return fromOrder;
    if (left.kind === "similar" && right.kind === "similar") {
      return (
        (right.score ?? 0) - (left.score ?? 0) ||
        left.toWorkId.localeCompare(right.toWorkId)
      );
    }
    return (
      left.kind.localeCompare(right.kind) ||
      left.toWorkId.localeCompare(right.toWorkId) ||
      left.id.localeCompare(right.id)
    );
  });
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
      const result = await loadProviderResult(
        client,
        query,
        fingerprint,
        options,
      );
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
  const workRelations = orderRelations([
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
      ...generatedIssues.filter(
        (issue) =>
          !existing.reviewIssues.some(
            (existingIssue) => existingIssue.id === issue.id,
          ),
      ),
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
