import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canPublishRecommendation,
  validateCatalog,
} from "../../src/domain/publication.js";
import { migrateLegacy } from "../../src/migration/legacy.js";
import { LegacyRootSchema } from "../../src/migration/legacy-schema.js";

const GENERATED_AT = "2026-07-14T00:00:00.000Z";
const rawSource: unknown = JSON.parse(
  await readFile("work/bumingbai_structured.json", "utf8"),
);
const legacy = LegacyRootSchema.parse(rawSource);
const catalog = migrateLegacy(rawSource, GENERATED_AT);

describe("complete legacy source migration", () => {
  it("preserves complete record counts and unique episode identities", () => {
    // Given
    const episodeIds = catalog.episodes.map((episode) => episode.id);
    const evidenceIds = catalog.recommendationEvidence.map(
      (evidence) => evidence.id,
    );

    // When
    const unnumberedEpisodes = catalog.episodes.filter(
      (episode) => episode.number === null,
    );

    // Then
    expect(catalog.episodes).toHaveLength(237);
    expect(catalog.recommendationEvidence).toHaveLength(423);
    expect(new Set(episodeIds).size).toBe(episodeIds.length);
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
    expect(unnumberedEpisodes).toHaveLength(14);
  });

  it("preserves recommendation raw text byte-for-byte and in source order", () => {
    // Given
    const sourceEntries = legacy.recommendations.map(
      (recommendation) => recommendation.raw_entry,
    );

    // When
    const migratedEntries = catalog.recommendationEvidence.map(
      (evidence) => evidence.rawText,
    );

    // Then
    expect(migratedEntries).toEqual(sourceEntries);
  });

  it("keeps every public recommendation publishable with an official URL", () => {
    // Given
    const publicEvidence = catalog.recommendationEvidence.filter(
      (evidence) => evidence.publicationStatus === "public",
    );

    // When
    const invalidEvidence = publicEvidence.filter(
      (evidence) =>
        !canPublishRecommendation(evidence) || evidence.source.url.length === 0,
    );

    // Then
    expect(publicEvidence.length).toBeGreaterThan(0);
    expect(invalidEvidence).toEqual([]);
  });

  it("does not promote legacy ratings into translation assessments", () => {
    // Given
    const sourceRatings = legacy.recommendations.filter(
      (recommendation) => recommendation.translation_quality.length > 0,
    );

    // When
    const promotedAssessments = catalog.editions.filter(
      (edition) => edition.translationAssessment.status !== "unverified",
    );

    // Then
    expect(sourceRatings.length).toBeGreaterThan(0);
    expect(promotedAssessments).toEqual([]);
  });

  it("contains no known guest placeholder names", () => {
    // Given
    const names = catalog.people.map((person) => person.name);

    // When
    const placeholders = names.filter(
      (name) =>
        name === "未在标题或简介中明确列名" || name.includes("未逐一列名"),
    );

    // Then
    expect(placeholders).toEqual([]);
  });

  it("passes semantic catalog validation", () => {
    // Given
    const completeCatalog = catalog;

    // When
    const issues = validateCatalog(completeCatalog);

    // Then
    expect(issues).toEqual([]);
  });

  it("is deterministic for the same source and generation time", () => {
    // Given
    const first = catalog;

    // When
    const second = migrateLegacy(rawSource, GENERATED_AT);

    // Then
    expect(second).toEqual(first);
  });
});
