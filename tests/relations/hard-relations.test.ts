import { describe, expect, expectTypeOf, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import {
  type Catalog,
  CatalogSchema,
  type WorkRelation,
} from "../../src/domain/schemas/catalog.js";
import { buildHardRelations } from "../../src/relations/hard-relations.js";

const retrievedAt = "2026-07-18T00:00:00.000Z";

const sourceA = {
  kind: "official_episode",
  url: "https://example.com/source-a",
  retrievedAt,
} as const;
const sourceB = {
  kind: "official_transcript",
  url: "https://example.com/source-b",
  retrievedAt,
  locator: "recommendations",
} as const;
const sourceC = {
  kind: "official_rss",
  url: "https://example.com/source-c",
  retrievedAt,
} as const;
const sourceDuplicate = {
  kind: "official_episode",
  url: "https://example.com/shared",
  retrievedAt,
} as const;

function catalogFixture(): Catalog {
  return CatalogSchema.parse({
    schemaVersion: 1,
    generatedAt: retrievedAt,
    episodes: [],
    people: [],
    topics: [],
    works: [
      {
        id: "work_111111111111",
        slug: "work-a",
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [sourceA, sourceDuplicate],
        title: "作品 A",
        mediaType: "book",
        creatorIds: ["person_111111111111", "person_222222222222"],
        topicIds: [],
        genres: [],
        regions: [],
        seriesId: "work_999999999999",
      },
      {
        id: "work_222222222222",
        slug: "work-b",
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [sourceB, sourceDuplicate],
        title: "作品 B",
        mediaType: "book",
        creatorIds: ["person_111111111111", "person_222222222222"],
        topicIds: [],
        genres: [],
        regions: [],
      },
      {
        id: "work_333333333333",
        slug: "work-c",
        verificationStatus: "verified",
        publicationStatus: "public",
        sources: [sourceC, sourceDuplicate],
        title: "作品 C",
        mediaType: "book",
        creatorIds: [],
        topicIds: [],
        genres: [],
        regions: [],
        seriesId: "work_999999999999",
      },
    ],
    editions: [],
    recommendationEvidence: [
      {
        id: "evidence_111111111111",
        episodeId: "episode_111111111111",
        workId: "work_111111111111",
        rawText: "推荐作品 A",
        source: sourceA,
        verificationStatus: "pending_verification",
        publicationStatus: "public",
      },
      {
        id: "evidence_222222222222",
        episodeId: "episode_111111111111",
        workId: "work_111111111111",
        rawText: "另一条作品 A 推荐",
        source: sourceDuplicate,
        verificationStatus: "rejected",
        publicationStatus: "public",
      },
      {
        id: "evidence_333333333333",
        episodeId: "episode_111111111111",
        workId: "work_222222222222",
        rawText: "推荐作品 B",
        source: sourceB,
        verificationStatus: "verified",
        publicationStatus: "public",
      },
      {
        id: "evidence_444444444444",
        episodeId: "episode_222222222222",
        workId: "work_111111111111",
        rawText: "暂缓作品 A 推荐",
        source: sourceA,
        verificationStatus: "verified",
        publicationStatus: "withheld",
      },
      {
        id: "evidence_555555555555",
        episodeId: "episode_222222222222",
        workId: "work_333333333333",
        rawText: "公开作品 C 推荐",
        source: sourceC,
        verificationStatus: "verified",
        publicationStatus: "public",
      },
      {
        id: "evidence_666666666666",
        episodeId: "episode_333333333333",
        workId: "work_222222222222",
        rawText: "公开作品 B 推荐",
        source: sourceB,
        verificationStatus: "verified",
        publicationStatus: "public",
      },
      {
        id: "evidence_777777777777",
        episodeId: "episode_333333333333",
        workId: "work_444444444444",
        rawText: "目录外作品推荐",
        source: sourceC,
        verificationStatus: "verified",
        publicationStatus: "public",
      },
    ],
    imageAssets: [],
    workRelations: [],
    providerRecords: [],
    reviewIssues: [],
  });
}

function reversedCatalog(catalog: Catalog): Catalog {
  return {
    ...catalog,
    works: [...catalog.works].reverse(),
    recommendationEvidence: [...catalog.recommendationEvidence].reverse(),
  };
}

describe("buildHardRelations", () => {
  it("returns a mutable relation array contract", () => {
    expectTypeOf(buildHardRelations(catalogFixture())).toEqualTypeOf<
      WorkRelation[]
    >();
  });

  it("derives traceable, deterministic bidirectional hard relations", () => {
    const catalog = catalogFixture();

    const relations = buildHardRelations(catalog);

    expect(relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createStableId(
            "relation",
            "work_111111111111",
            "work_222222222222",
            "same_creator",
          ),
          fromWorkId: "work_111111111111",
          toWorkId: "work_222222222222",
          kind: "same_creator",
          reasons: ["同一创作者"],
          sources: [sourceDuplicate, sourceA, sourceB],
        }),
        expect.objectContaining({
          id: createStableId(
            "relation",
            "work_111111111111",
            "work_333333333333",
            "same_series",
          ),
          fromWorkId: "work_111111111111",
          toWorkId: "work_333333333333",
          kind: "same_series",
          reasons: ["同一系列"],
          sources: [sourceDuplicate, sourceA, sourceC],
        }),
        expect.objectContaining({
          id: createStableId(
            "relation",
            "work_111111111111",
            "work_222222222222",
            "same_episode",
          ),
          fromWorkId: "work_111111111111",
          toWorkId: "work_222222222222",
          kind: "same_episode",
          reasons: ["同一期节目推荐"],
          sources: [sourceDuplicate, sourceA, sourceB],
        }),
      ]),
    );
    expect(relations.some((item) => item.fromWorkId === item.toWorkId)).toBe(
      false,
    );
    expect(
      relations.some(
        (item) =>
          item.kind === "same_episode" &&
          item.fromWorkId === "work_111111111111" &&
          item.toWorkId === "work_333333333333",
      ),
    ).toBe(false);
    expect(relations.every((item) => item.score === undefined)).toBe(true);
    expect(relations).toHaveLength(6);
    expect(
      relations.map((item) => [item.kind, item.fromWorkId, item.toWorkId]),
    ).toEqual([
      ["same_creator", "work_111111111111", "work_222222222222"],
      ["same_episode", "work_111111111111", "work_222222222222"],
      ["same_series", "work_111111111111", "work_333333333333"],
      ["same_creator", "work_222222222222", "work_111111111111"],
      ["same_episode", "work_222222222222", "work_111111111111"],
      ["same_series", "work_333333333333", "work_111111111111"],
    ]);
    expect(buildHardRelations(reversedCatalog(catalog))).toEqual(relations);
  });
});
