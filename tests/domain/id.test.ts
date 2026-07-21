import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createSlug,
  createStableId,
  normalizeIdentityText,
} from "../../src/domain/id.js";
import {
  type EditionId,
  EditionIdSchema,
  type EpisodeId,
  EpisodeIdSchema,
  type ImageAssetId,
  ImageAssetIdSchema,
  type PersonId,
  PersonIdSchema,
  type ProviderRecordId,
  ProviderRecordIdSchema,
  type RecommendationEvidenceId,
  RecommendationEvidenceIdSchema,
  type ReviewIssueId,
  ReviewIssueIdSchema,
  type TopicId,
  TopicIdSchema,
  type WorkId,
  WorkIdSchema,
  type WorkRelationId,
  WorkRelationIdSchema,
} from "../../src/domain/schemas/primitives.js";

const KNOWN_ENTITY_ID_CASES = [
  ["edition", EditionIdSchema],
  ["episode", EpisodeIdSchema],
  ["evidence", RecommendationEvidenceIdSchema],
  ["image", ImageAssetIdSchema],
  ["issue", ReviewIssueIdSchema],
  ["person", PersonIdSchema],
  ["provider", ProviderRecordIdSchema],
  ["relation", WorkRelationIdSchema],
  ["topic", TopicIdSchema],
  ["work", WorkIdSchema],
] as const;

describe("identity helpers", () => {
  it("normalizes width, case, and whitespace", () => {
    // Given
    const value = "  Speak，  Memory  ";

    // When
    const normalized = normalizeIdentityText(value);

    // Then
    expect(normalized).toBe("speak, memory");
  });

  it("creates deterministic prefixed ids", () => {
    // Given
    const canonicalParts = ["Speak, Memory", "Vladimir Nabokov"];
    const variantParts = [" speak,  memory ", "vladimir nabokov"];

    // When
    const canonicalId = createStableId("work", ...canonicalParts);
    const variantId = createStableId("work", ...variantParts);

    // Then
    expect(canonicalId).toMatch(/^work_[a-f0-9]{12}$/);
    expect(canonicalId).toBe("work_62ba76f41098");
    expect(canonicalId).toBe(variantId);
  });

  it("returns corresponding branded types for known literal prefixes", () => {
    // Given
    const identity = "catalog identity";

    // When
    const editionId = createStableId("edition", identity);
    const episodeId = createStableId("episode", identity);
    const evidenceId = createStableId("evidence", identity);
    const imageId = createStableId("image", identity);
    const issueId = createStableId("issue", identity);
    const personId = createStableId("person", identity);
    const providerId = createStableId("provider", identity);
    const relationId = createStableId("relation", identity);
    const topicId = createStableId("topic", identity);
    const workId = createStableId("work", identity);

    // Then
    expectTypeOf(editionId).toEqualTypeOf<EditionId>();
    expectTypeOf(episodeId).toEqualTypeOf<EpisodeId>();
    expectTypeOf(evidenceId).toEqualTypeOf<RecommendationEvidenceId>();
    expectTypeOf(imageId).toEqualTypeOf<ImageAssetId>();
    expectTypeOf(issueId).toEqualTypeOf<ReviewIssueId>();
    expectTypeOf(personId).toEqualTypeOf<PersonId>();
    expectTypeOf(providerId).toEqualTypeOf<ProviderRecordId>();
    expectTypeOf(relationId).toEqualTypeOf<WorkRelationId>();
    expectTypeOf(topicId).toEqualTypeOf<TopicId>();
    expectTypeOf(workId).toEqualTypeOf<WorkId>();
  });

  it.each(
    KNOWN_ENTITY_ID_CASES,
  )("conforms to the %s entity ID schema", (prefix, schema) => {
    // Given
    const identity = "catalog identity";

    // When
    const id = createStableId(prefix, identity);

    // Then
    expect(schema.safeParse(id).success).toBe(true);
  });

  it("keeps arbitrary prefixes open", () => {
    // Given
    const prefix: string = "custom";

    // When
    const id = createStableId(prefix, "identity");

    // Then
    expectTypeOf(id).toEqualTypeOf<string>();
    expect(id).toMatch(/^custom_[a-f0-9]{12}$/);
  });

  it("keeps Chinese characters in slugs", () => {
    // Given
    const value = "说吧，记忆 Speak Memory";

    // When
    const slug = createSlug(value);

    // Then
    expect(slug).toBe("说吧-记忆-speak-memory");
  });
});
