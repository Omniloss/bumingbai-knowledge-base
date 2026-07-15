import { readFile } from "node:fs/promises";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createStableId } from "../../src/domain/id.js";
import type { Catalog } from "../../src/domain/schemas/catalog.js";
import {
  LegacyEpisodeReferenceError,
  migrateLegacy,
} from "../../src/migration/legacy.js";

const BASE_EPISODE = {
  episode_number: 4,
  title: "测试节目",
  published_at: "Fri, 17 Jun 2022 09:00:00 GMT",
  official_url: "https://bumingbai.net/episodes/4",
  guest_or_participants: "测试嘉宾",
} as const;

const BASE_RECOMMENDATION = {
  episode_number: 4,
  recommendation_order: 1,
  recommender: "测试嘉宾",
  raw_entry: "《休战》 普里莫·莱维 著",
  title: "休战",
  original_title: "La tregua",
  creator: "普里莫·莱维",
  media_type: "书籍/文本",
  item_source_url: "https://example.com/editions/truce",
  translator: "杨晨光",
  publisher: "中信出版社",
  publication_year: "2015",
  isbn: "9787508652535",
  translation_quality: "未核实",
} as const;

function createLegacyInput(
  recommendations: readonly object[],
  episodes: readonly object[] = [BASE_EPISODE],
): unknown {
  return {
    retrieved_at: "2026-07-14T00:00:00.000Z",
    episodes,
    recommendations,
  };
}

describe("migrateLegacy", () => {
  it("preserves episode evidence and creates normalized entities", async () => {
    // Given
    const raw: unknown = JSON.parse(
      await readFile("tests/fixtures/legacy-small.json", "utf8"),
    );

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.episodes).toHaveLength(1);
    expect(catalog.works).toHaveLength(1);
    expect(catalog.recommendationEvidence[0]?.rawText).toBe(
      "《休战》 普里莫·莱维 著",
    );
    expect(catalog.recommendationEvidence[0]?.source.url).toBe(
      "https://bumingbai.net/2022/06/17/ep-004/",
    );
    expect(catalog.recommendationEvidence[0]?.verificationStatus).toBe(
      "partially_verified",
    );
    expect(catalog.editions[0]?.translationAssessment.status).toBe(
      "unverified",
    );
    expect(catalog.works[0]?.id).toBe(
      createStableId("work", "La tregua", "普里莫·莱维"),
    );
    expect(catalog.editions[0]?.id).toBe(
      createStableId(
        "edition",
        createStableId("work", "La tregua", "普里莫·莱维"),
        "9787508652535",
        "中信出版社",
      ),
    );
    expectTypeOf(catalog).toEqualTypeOf<Catalog>();
  });

  it("records ambiguous legacy fields as review issues", () => {
    // Given
    const raw = createLegacyInput([
      {
        ...BASE_RECOMMENDATION,
        creator: "",
      },
      {
        ...BASE_RECOMMENDATION,
        recommendation_order: 2,
        raw_entry: "《真实标题》 测试作者 著",
        title: "错误标题",
        original_title: "",
        creator: "测试作者",
        isbn: "",
        translator: "",
        publisher: "",
      },
      {
        ...BASE_RECOMMENDATION,
        recommendation_order: 3,
        raw_entry: "《冲突版本》 测试作者 著",
        title: "冲突版本",
        original_title: "Conflicting Edition",
        creator: "测试作者",
        isbn: "9780000000001",
        translator: "译者甲",
        publisher: "测试出版社",
      },
      {
        ...BASE_RECOMMENDATION,
        recommendation_order: 4,
        raw_entry: "《冲突版本》 测试作者 著",
        title: "冲突版本",
        original_title: "Conflicting Edition",
        creator: "测试作者",
        isbn: "9780000000001",
        translator: "译者乙",
        publisher: "测试出版社",
      },
    ]);

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.recommendationEvidence).toHaveLength(4);
    expect(catalog.reviewIssues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["creatorIds", "title", "isbn"]),
    );
    expect(
      catalog.reviewIssues.find((issue) => issue.field === "isbn")?.candidates,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("译者甲"),
        expect.stringContaining("译者乙"),
      ]),
    );
  });

  it("throws a typed error when a recommendation references no episode", () => {
    // Given
    const raw = createLegacyInput([
      { ...BASE_RECOMMENDATION, episode_number: 99 },
    ]);

    // When
    const migrate = () => migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(migrate).toThrowError(LegacyEpisodeReferenceError);
  });

  it("never promotes a legacy translation-quality claim", () => {
    // Given
    const raw = createLegacyInput([
      { ...BASE_RECOMMENDATION, translation_quality: "可信译本" },
    ]);

    // When
    const catalog = migrateLegacy(raw, "2026-07-14T00:00:00.000Z");

    // Then
    expect(catalog.editions[0]?.translationAssessment).toEqual({
      status: "unverified",
      summary: "未核实，作品总评分不能代替翻译评价",
      sources: [],
    });
  });
});
