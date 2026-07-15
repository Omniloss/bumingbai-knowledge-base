import {
  type Catalog,
  CatalogSchema,
  type Edition,
  type Work,
} from "../domain/schemas/catalog.js";
import type { EditionId, WorkId } from "../domain/schemas/primitives.js";
import { migrateEpisodes } from "./legacy-episode.js";
import { legacyEpisodeLookup } from "./legacy-episode-identity.js";
import {
  migrateRecommendation,
  type RecommendationState,
} from "./legacy-recommendation.js";
import type { LegacyRoot } from "./legacy-schema.js";

export function buildCatalog(legacy: LegacyRoot, generatedAt: string): Catalog {
  const episodeMigration = migrateEpisodes(
    legacy.episodes,
    legacy.retrieved_at,
  );
  const episodeByIdentity = new Map(
    legacy.episodes.map(
      (episode) => [legacyEpisodeLookup(episode).key, episode] as const,
    ),
  );
  const initial: RecommendationState = {
    people: episodeMigration.people,
    works: new Map<WorkId, Work>(),
    workCandidates: new Map(),
    editions: new Map<EditionId, Edition>(),
    editionCandidates: new Map(),
    editionCandidatesByIsbn: new Map(),
    recommendationEvidence: [],
    reviewIssues: [],
  };
  const recommendationMigration = legacy.recommendations.reduce(
    (state, recommendation) =>
      migrateRecommendation(state, recommendation, {
        episodeByIdentity,
        retrievedAt: legacy.retrieved_at,
      }),
    initial,
  );
  return CatalogSchema.parse({
    schemaVersion: 1,
    generatedAt,
    episodes: episodeMigration.episodes,
    people: [...recommendationMigration.people.values()],
    topics: [],
    works: [...recommendationMigration.works.values()],
    editions: [...recommendationMigration.editions.values()],
    recommendationEvidence: recommendationMigration.recommendationEvidence,
    imageAssets: [],
    workRelations: [],
    providerRecords: [],
    reviewIssues: recommendationMigration.reviewIssues,
  });
}
