import { describe, expect, it } from "vitest";
import {
  canPublishRecommendation,
  validateCatalog,
} from "../../src/domain/publication.js";
import { CatalogSchema } from "../../src/domain/schemas/catalog.js";
import {
  EditionSchema,
  EpisodeSchema,
  RecommendationEvidenceSchema,
  WorkSchema,
} from "../../src/domain/schemas/entities.js";

const GENERATED_AT = "2026-07-14T00:00:00.000Z";
const SOURCE = {
  kind: "official_episode",
  url: "https://bumingbai.net/example",
  retrievedAt: GENERATED_AT,
} as const;

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

function catalog(overrides: Readonly<Record<string, unknown>> = {}) {
  return CatalogSchema.parse({ ...EMPTY_CATALOG, ...overrides });
}

function recommendation(overrides: Readonly<Record<string, unknown>> = {}) {
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

function episode(overrides: Readonly<Record<string, unknown>> = {}) {
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

function work(overrides: Readonly<Record<string, unknown>> = {}) {
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

function edition(overrides: Readonly<Record<string, unknown>> = {}) {
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

describe("canPublishRecommendation", () => {
  it("rejects pending evidence", () => {
    // Given
    const evidence = recommendation({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });

    // When
    // Then
    expect(canPublishRecommendation(evidence)).toBe(false);
  });

  it("accepts verified official evidence", () => {
    // Given
    const evidence = recommendation({
      source: { ...SOURCE, kind: "official_transcript" },
    });

    // When
    // Then
    expect(canPublishRecommendation(evidence)).toBe(true);
  });

  it.each([
    ["partial official", { verificationStatus: "partially_verified" }, true],
    ["withheld", { publicationStatus: "withheld" }, false],
    ["provider", { source: { ...SOURCE, kind: "provider_api" } }, false],
  ])("returns expected eligibility for %s", (_name, overrides, expected) => {
    expect(canPublishRecommendation(recommendation(overrides))).toBe(expected);
  });
});

describe("validateCatalog", () => {
  it("reports every plan-defined missing reference", () => {
    // Given
    const input = catalog({
      episodes: [episode({ topicIds: ["topic_aaaaaaaaaaaa"] })],
      works: [
        work({
          publicationStatus: "withheld",
          topicIds: ["topic_bbbbbbbbbbbb"],
        }),
      ],
      editions: [
        edition({
          workId: "work_222222222222",
          translatorIds: ["person_222222222222"],
        }),
      ],
      recommendationEvidence: [
        recommendation({
          episodeId: "episode_222222222222",
          workId: "work_333333333333",
          publicationStatus: "withheld",
        }),
      ],
    });

    // When
    const issues = validateCatalog(input);

    // Then
    expect(
      issues
        .filter((issue) => issue.code === "missing_reference")
        .map((issue) => `${issue.entityId}|${issue.message}`),
    ).toEqual([
      "edition_111111111111|Edition.translatorIds references missing Person person_222222222222",
      "edition_111111111111|Edition.workId references missing Work work_222222222222",
      "episode_111111111111|Episode.topicIds references missing Topic topic_aaaaaaaaaaaa",
      "evidence_111111111111|RecommendationEvidence.episodeId references missing Episode episode_222222222222",
      "evidence_111111111111|RecommendationEvidence.workId references missing Work work_333333333333",
      "work_111111111111|Work.topicIds references missing Topic topic_bbbbbbbbbbbb",
    ]);
  });

  it("reports duplicate IDs, unsupported assessments, and unevidenced public works", () => {
    // Given
    const publicWork = work();
    const duplicateWork = work({
      id: "work_222222222222",
      publicationStatus: "withheld",
    });
    const input = catalog({
      works: [publicWork, duplicateWork, duplicateWork],
      editions: [
        edition({
          workId: publicWork.id,
          translationAssessment: {
            status: "verified",
            summary: "译文准确",
            sources: [],
          },
        }),
      ],
    });

    // When
    // Then
    expect(validateCatalog(input).map((issue) => issue.code)).toEqual([
      "duplicate_id",
      "unsupported_translation_assessment",
      "public_work_without_evidence",
    ]);
  });

  it("returns the same multi-issue order for reversed entity arrays", () => {
    // Given
    const first = work({ id: "work_aaaaaaaaaaaa" });
    const second = work({ id: "work_bbbbbbbbbbbb" });

    // When
    const forward = validateCatalog(catalog({ works: [first, second] }));
    const reversed = validateCatalog(catalog({ works: [second, first] }));

    // Then
    expect(reversed).toEqual(forward);
  });

  it("accepts a public work backed by publishable evidence", () => {
    const input = catalog({
      episodes: [episode()],
      works: [work()],
      recommendationEvidence: [recommendation()],
    });

    expect(validateCatalog(input)).toEqual([]);
  });
});
