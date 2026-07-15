import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CatalogSchema,
  type Episode,
} from "../../src/domain/schemas/catalog.js";
import type { PersonId } from "../../src/domain/schemas/primitives.js";

describe("CatalogSchema", () => {
  it("accepts an empty versioned catalog", () => {
    expect(
      CatalogSchema.parse({
        schemaVersion: 1,
        generatedAt: "2026-07-14T00:00:00.000Z",
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
      }),
    ).toBeTruthy();
  });

  it("rejects a recommendation without raw evidence text", () => {
    const result = CatalogSchema.safeParse({
      schemaVersion: 1,
      generatedAt: "2026-07-14T00:00:00.000Z",
      episodes: [],
      people: [],
      topics: [],
      works: [],
      editions: [],
      recommendationEvidence: [
        {
          id: "evidence_111111111111",
          episodeId: "episode_111111111111",
          workId: "work_111111111111",
          rawText: "",
          source: {
            kind: "official_episode",
            url: "https://bumingbai.net/example",
            retrievedAt: "2026-07-14T00:00:00.000Z",
          },
          verificationStatus: "verified",
          publicationStatus: "public",
        },
      ],
      imageAssets: [],
      workRelations: [],
      providerRecords: [],
      reviewIssues: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects entity IDs used in the wrong domain field", () => {
    const result = CatalogSchema.safeParse({
      schemaVersion: 1,
      generatedAt: "2026-07-14T00:00:00.000Z",
      episodes: [],
      people: [],
      topics: [],
      works: [],
      editions: [],
      recommendationEvidence: [
        {
          id: "evidence_111111111111",
          episodeId: "work_111111111111",
          workId: "episode_111111111111",
          rawText: "正式推荐文本",
          source: {
            kind: "official_episode",
            url: "https://bumingbai.net/example",
            retrievedAt: "2026-07-14T00:00:00.000Z",
          },
          verificationStatus: "verified",
          publicationStatus: "public",
        },
      ],
      imageAssets: [],
      workRelations: [],
      providerRecords: [],
      reviewIssues: [],
    });

    expect(result.success).toBe(false);
  });

  it("infers readonly, domain-specific entity references", () => {
    expectTypeOf<Episode["guestIds"]>().toEqualTypeOf<readonly PersonId[]>();
  });
});
