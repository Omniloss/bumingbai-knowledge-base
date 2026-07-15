import { describe, expect, it } from "vitest";
import { migrateLegacy } from "../../src/migration/legacy.js";

const EPISODE = {
  episode_number: 4,
  title: "状态测试节目",
  published_at: "Fri, 17 Jun 2022 09:00:00 GMT",
  official_url: "https://bumingbai.net/episodes/status-test",
  recommendation_status: "官方简介明确标注",
} as const;

const RECOMMENDATION = {
  episode_number: 4,
  recommendation_order: 1,
  raw_entry: "《状态测试书》 测试作者 著",
  title: "状态测试书",
  creator: "测试作者",
  media_type: "书籍/文本",
  item_source_url: "https://example.com/books/status-test",
  translator: "测试译者",
  publisher: "测试出版社",
  publication_year: "2026",
  isbn: "9780000000002",
  metadata_status: "已抓取推荐链接元数据",
} as const;

function statusInput(
  recommendationStatus: string | undefined,
  metadataStatus: string | undefined,
): unknown {
  return {
    retrieved_at: "2026-07-14T00:00:00.000Z",
    episodes: [{ ...EPISODE, recommendation_status: recommendationStatus }],
    recommendations: [{ ...RECOMMENDATION, metadata_status: metadataStatus }],
  };
}

describe("legacy status mapping", () => {
  it("publishes explicit official evidence with fetched-link metadata", () => {
    // Given
    const raw = statusInput("官方简介明确标注", "已抓取推荐链接元数据");

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.recommendationEvidence[0]).toMatchObject({
      verificationStatus: "partially_verified",
      publicationStatus: "public",
    });
    expect(catalog.works[0]?.publicationStatus).toBe("public");
    expect(catalog.editions[0]).toMatchObject({
      verificationStatus: "partially_verified",
      publicationStatus: "public",
    });
    expect(catalog.reviewIssues).toEqual([]);
  });

  it("withholds recommendations not marked by the official episode", () => {
    // Given
    const raw = statusInput("官方简介未出现推荐标记", "已抓取推荐链接元数据");

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.recommendationEvidence[0]).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });
    expect(catalog.works[0]?.publicationStatus).toBe("withheld");
    expect(catalog.editions[0]?.publicationStatus).toBe("withheld");
    expect(catalog.reviewIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidates: ["官方简介未出现推荐标记"],
          field: "recommendationStatus",
          status: "open",
        }),
      ]),
    );
  });

  it("withholds raw-only bibliographic metadata", () => {
    // Given
    const raw = statusInput(
      "官方简介明确标注",
      "仅保留节目原文，待人工书目核验",
    );

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.recommendationEvidence[0]?.publicationStatus).toBe("public");
    expect(catalog.works[0]?.publicationStatus).toBe("public");
    expect(catalog.editions[0]).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });
    expect(catalog.reviewIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidates: ["仅保留节目原文，待人工书目核验"],
          field: "metadataStatus",
          status: "open",
        }),
      ]),
    );
  });

  it.each([
    undefined,
    "",
    "尚未定义的新状态",
  ])("withholds %s episode status", (status) => {
    // Given
    const raw = statusInput(status, undefined);

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.recommendationEvidence[0]).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });
    expect(catalog.editions[0]?.publicationStatus).toBe("withheld");
    expect(catalog.reviewIssues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["recommendationStatus", "metadataStatus"]),
    );
    expect(
      catalog.reviewIssues.find(
        (issue) => issue.field === "recommendationStatus",
      )?.candidates,
    ).toEqual(status ? [status] : []);
  });

  it.each([
    undefined,
    "",
    "尚未定义的新元数据状态",
  ])("withholds %s metadata status for explicit evidence", (status) => {
    // Given
    const raw = statusInput("官方简介明确标注", status);

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.recommendationEvidence[0]?.publicationStatus).toBe("public");
    expect(catalog.works[0]?.publicationStatus).toBe("public");
    expect(catalog.editions[0]).toMatchObject({
      verificationStatus: "pending_verification",
      publicationStatus: "withheld",
    });
    expect(
      catalog.reviewIssues.find((issue) => issue.field === "metadataStatus"),
    ).toMatchObject({ candidates: status ? [status] : [], status: "open" });
  });
});
