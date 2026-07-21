import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import {
  EditionSchema,
  EpisodeSchema,
  PersonSchema,
  RecommendationEvidenceSchema,
  WorkSchema,
} from "../../src/domain/schemas/entities.js";

export const GENERATED_AT = "2026-07-14T00:00:00.000Z";
export const SOURCE = {
  kind: "official_episode",
  url: "https://bumingbai.net/example",
  retrievedAt: GENERATED_AT,
} as const;
export const RSS_SOURCE = { ...SOURCE, kind: "official_rss" } as const;

const EMPTY_CATALOG = CatalogSchema.parse({
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
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

export function catalog(overrides: Readonly<Record<string, unknown>> = {}) {
  return CatalogSchema.parse({ ...EMPTY_CATALOG, ...overrides });
}

export function recommendation(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return RecommendationEvidenceSchema.parse({
    id: "evidence_111111111111",
    episodeId: "episode_111111111111",
    workId: "work_111111111111",
    rawText: "《休战》",
    source: SOURCE,
    verificationStatus: "verified",
    publicationStatus: "public",
    ...overrides,
  });
}

export function episode(overrides: Readonly<Record<string, unknown>> = {}) {
  return EpisodeSchema.parse({
    id: "episode_111111111111",
    slug: "episode-1",
    number: 1,
    title: "第一期",
    publishedAt: GENERATED_AT,
    officialUrl: SOURCE.url,
    guestIds: [],
    topicIds: [],
    verificationStatus: "verified",
    publicationStatus: "public",
    sources: [SOURCE],
    ...overrides,
  });
}

export function work(overrides: Readonly<Record<string, unknown>> = {}) {
  return WorkSchema.parse({
    id: "work_111111111111",
    slug: "the-truce",
    title: "休战",
    mediaType: "book",
    creatorIds: [],
    topicIds: [],
    genres: [],
    regions: [],
    verificationStatus: "verified",
    publicationStatus: "public",
    sources: [SOURCE],
    ...overrides,
  });
}

export function edition(overrides: Readonly<Record<string, unknown>> = {}) {
  return EditionSchema.parse({
    id: "edition_111111111111",
    slug: "the-truce-zh",
    workId: "work_111111111111",
    language: "zh",
    title: "休战",
    translatorIds: [],
    translationAssessment: {
      status: "unverified",
      summary: "未核实",
      sources: [],
    },
    verificationStatus: "verified",
    publicationStatus: "public",
    sources: [SOURCE],
    ...overrides,
  });
}

export function person(overrides: Readonly<Record<string, unknown>> = {}) {
  return PersonSchema.parse({
    id: "person_111111111111",
    slug: "person-1",
    name: "Person One",
    aliases: [],
    roles: ["author"],
    verificationStatus: "verified",
    publicationStatus: "public",
    sources: [SOURCE],
    ...overrides,
  });
}
