import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CatalogSchema,
  type Episode,
} from "../../src/domain/schemas/catalog.js";
import {
  EpisodeSchema,
  ImageAssetSchema,
} from "../../src/domain/schemas/entities.js";
import type { PersonId } from "../../src/domain/schemas/primitives.js";

const EPISODE = {
  id: "episode_111111111111",
  slug: "special-111111",
  number: null,
  title: "无编号特别节目",
  publishedAt: "2026-07-01T09:00:00.000Z",
  officialUrl: "https://bumingbai.net/episodes/special",
  guestIds: [],
  topicIds: [],
  verificationStatus: "partially_verified",
  publicationStatus: "public",
  sources: [],
} as const;

const IMAGE_ASSET = {
  id: "image_111111111111",
  workId: "work_111111111111",
  role: "hero",
  editionRole: "original",
  handling: "hotlink_only",
  url: "https://images.example.com/original.jpg",
  sourcePageUrl: "https://example.com/source",
  width: 1200,
  height: 1800,
  license: "source terms",
  attribution: "Example source",
  lastVerifiedAt: "2026-07-14T00:00:00.000Z",
  broken: false,
} as const;

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

  it("accepts an explicitly unnumbered episode", () => {
    // Given
    const episode = EPISODE;

    // When
    const result = EpisodeSchema.safeParse(episode);

    // Then
    expect(result.success).toBe(true);
  });

  it.each([0, -1])("rejects invalid episode number %s", (number) => {
    // Given
    const episode = { ...EPISODE, number };

    // When
    const result = EpisodeSchema.safeParse(episode);

    // Then
    expect(result.success).toBe(false);
  });

  it.each([
    "http://images.example.com/original.jpg",
    "ftp://images.example.com/original.jpg",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "javascript:alert(1)",
    "/\\evil.example/x.jpg",
    "/\\/evil.example/x.jpg",
  ])("rejects unsafe image URL %s", (url) => {
    expect(ImageAssetSchema.safeParse({ ...IMAGE_ASSET, url }).success).toBe(
      false,
    );
  });

  it.each([
    "https://images.example.com/original.jpg",
    "/images/original.jpg",
  ])("accepts safe image URL %s", (url) => {
    expect(ImageAssetSchema.safeParse({ ...IMAGE_ASSET, url }).success).toBe(
      true,
    );
  });
});
