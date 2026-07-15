import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createSlug,
  createStableId,
  normalizeIdentityText,
} from "../../src/domain/id.js";
import {
  EditionIdSchema,
  EpisodeIdSchema,
  ImageAssetIdSchema,
  PersonIdSchema,
  ProviderRecordIdSchema,
  RecommendationEvidenceIdSchema,
  ReviewIssueIdSchema,
  TopicIdSchema,
  type WorkId,
  WorkIdSchema,
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
    expect(canonicalId).toBe(variantId);
  });

  it("returns a branded WorkId for the work prefix", () => {
    // Given
    const title = "Speak, Memory";

    // When
    const workId = createStableId("work", title);
    const episodeId = createStableId("episode", "101");

    // Then
    expectTypeOf(workId).toEqualTypeOf<WorkId>();
    expect(WorkIdSchema.safeParse(workId).success).toBe(true);
    expect(EpisodeIdSchema.safeParse(episodeId).success).toBe(true);
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
